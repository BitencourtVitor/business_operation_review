package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
}

type ChatResponse struct {
	Text         string
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
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

func (c *OpenRouterClient) Chat(ctx context.Context, messages []ChatMessage) (*ChatResponse, error) {
	body, err := json.Marshal(chatRequest{Model: c.model, Messages: messages})
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

	var or orResponse
	if err := json.NewDecoder(resp.Body).Decode(&or); err != nil {
		return nil, fmt.Errorf("openrouter: decode: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter: status %d", resp.StatusCode)
	}
	if len(or.Choices) == 0 {
		return nil, fmt.Errorf("openrouter: empty choices")
	}

	return &ChatResponse{
		Text:         or.Choices[0].Message.Content,
		TokensInput:  or.Usage.PromptTokens,
		TokensOutput: or.Usage.CompletionTokens,
		Model:        or.Model,
	}, nil
}
