package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const openRouterURL = "https://openrouter.ai/api/v1/chat/completions"

type OpenRouterClient struct {
	apiKey string
	model  string
	http   *http.Client
}

func NewOpenRouterClient(apiKey, model string) *OpenRouterClient {
	return &OpenRouterClient{
		apiKey: apiKey,
		model:  model,
		http:   &http.Client{Timeout: 90 * time.Second},
	}
}

func (c *OpenRouterClient) Model() string { return c.model }

// ── Wire types (OpenAI-compatible) ──────────────────────────────────────────────

type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"` // role=tool: which call this answers
	Name       string     `json:"name,omitempty"`         // role=tool: tool name
}

type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON-encoded string
}

// Tool advertises a callable function to the model.
type Tool struct {
	Type     string       `json:"type"` // "function"
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"` // JSON Schema
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Tools    []Tool        `json:"tools,omitempty"`
}

// Uma mensagem cujo conteúdo é uma lista de pedaços, e não uma string.
//
// É o formato que o protocolo exige quando entra áudio ou imagem junto do
// texto. Vive separado de ChatMessage de propósito: mensagem de texto é a
// esmagadora maioria das chamadas do sistema, e afrouxar o tipo dela para caber
// o caso raro faria todo chamador existente lidar com uma forma que nunca usa.
type chatRequestPartes struct {
	Model    string             `json:"model"`
	Messages []mensagemComPecas `json:"messages"`
	// Transcrição não é lugar de criatividade: o que se quer é o que foi dito.
	Temperature float64 `json:"temperature"`
}

type mensagemComPecas struct {
	Role    string           `json:"role"`
	Content []pecaDeConteudo `json:"content"`
}

type pecaDeConteudo struct {
	Type       string       `json:"type"`
	Text       string       `json:"text,omitempty"`
	InputAudio *audioEmBase `json:"input_audio,omitempty"`
}

type audioEmBase struct {
	// O arquivo inteiro em base64. O protocolo não aceita URL para áudio: o
	// modelo precisa dos bytes.
	Data string `json:"data"`
	// Hoje, wav ou mp3.
	Format string `json:"format"`
}

type ChatResponse struct {
	Text         string
	ToolCalls    []ToolCall
	TokensInput  int
	TokensOutput int
	CostUSD      float64
	Model        string
}

type orResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

// Chat sends a plain message exchange with no tools.
func (c *OpenRouterClient) Chat(ctx context.Context, messages []ChatMessage) (*ChatResponse, error) {
	return c.ChatWithTools(ctx, messages, nil)
}

// ChatAudio manda um áudio junto do texto.
//
// Existe para a descrição falada do punch list. O áudio vai em base64 dentro da
// própria mensagem porque o protocolo não aceita URL para som, e por isso quem
// chama precisa ter os bytes em mãos.
func (c *OpenRouterClient) ChatAudio(ctx context.Context, prompt, audioBase64, formato string) (*ChatResponse, error) {
	body, err := json.Marshal(chatRequestPartes{
		Model:       c.model,
		Temperature: 0,
		Messages: []mensagemComPecas{{
			Role: "user",
			Content: []pecaDeConteudo{
				{Type: "text", Text: prompt},
				{Type: "input_audio", InputAudio: &audioEmBase{Data: audioBase64, Format: formato}},
			},
		}},
	})
	if err != nil {
		return nil, fmt.Errorf("openrouter: marshal: %w", err)
	}
	return c.enviar(ctx, body)
}

// ChatWithTools sends messages and, when tools are provided, lets the model
// request tool calls. The returned ChatResponse carries either Text or ToolCalls.
func (c *OpenRouterClient) ChatWithTools(ctx context.Context, messages []ChatMessage, tools []Tool) (*ChatResponse, error) {
	body, err := json.Marshal(chatRequest{Model: c.model, Messages: messages, Tools: tools})
	if err != nil {
		return nil, fmt.Errorf("openrouter: marshal: %w", err)
	}
	return c.enviar(ctx, body)
}

// enviar é a parte que não muda de uma chamada para outra: credencial, envio,
// leitura do erro real e a conta de tokens.
func (c *OpenRouterClient) enviar(ctx context.Context, body []byte) (*ChatResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("openrouter: request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openrouter: do: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		// Surface the real API error (e.g. "No endpoints found for <model>") instead of just the status.
		return nil, fmt.Errorf("openrouter: status %d: %s", resp.StatusCode, string(raw))
	}

	var or orResponse
	if err := json.Unmarshal(raw, &or); err != nil {
		return nil, fmt.Errorf("openrouter: decode: %w", err)
	}
	if len(or.Choices) == 0 {
		return nil, fmt.Errorf("openrouter: empty choices")
	}

	return &ChatResponse{
		Text:         or.Choices[0].Message.Content,
		ToolCalls:    or.Choices[0].Message.ToolCalls,
		TokensInput:  or.Usage.PromptTokens,
		TokensOutput: or.Usage.CompletionTokens,
		Model:        or.Model,
	}, nil
}
