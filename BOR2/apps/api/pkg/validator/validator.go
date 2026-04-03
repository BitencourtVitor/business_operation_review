package validator

import (
	"fmt"
	"strings"
)

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	msgs := make([]string, len(e))
	for i, err := range e {
		msgs[i] = fmt.Sprintf("%s: %s", err.Field, err.Message)
	}
	return strings.Join(msgs, "; ")
}

func Required(field, value string) *ValidationError {
	if strings.TrimSpace(value) == "" {
		return &ValidationError{Field: field, Message: "is required"}
	}
	return nil
}

func MinLength(field, value string, min int) *ValidationError {
	if len(value) < min {
		return &ValidationError{
			Field:   field,
			Message: fmt.Sprintf("must be at least %d characters", min),
		}
	}
	return nil
}

func Email(field, value string) *ValidationError {
	if !strings.Contains(value, "@") || !strings.Contains(value, ".") {
		return &ValidationError{Field: field, Message: "must be a valid email"}
	}
	return nil
}
