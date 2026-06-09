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

// ChatWithTools sends messages and, when tools are provided, lets the model
// request tool calls. The returned ChatResponse carries either Text or ToolCalls.
func (c *OpenRouterClient) ChatWithTools(ctx context.Context, messages []ChatMessage, tools []Tool) (*ChatResponse, error) {
	body, err := json.Marshal(chatRequest{Model: c.model, Messages: messages, Tools: tools})
	if err != nil {
		return nil, fmt.Errorf("openrouter: marshal: %w", err)
	}

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
