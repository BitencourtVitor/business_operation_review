package domain

import "time"

type Role string

const (
	RoleAdmin   Role = "admin"
	RoleManager Role = "manager"
	RoleViewer  Role = "viewer"
)

type User struct {
	ID                  string    `json:"id"`
	Email               string    `json:"email"`
	Name                string    `json:"name"`
	Role                Role      `json:"role"`
	PasswordHash        string    `json:"-"`
	ProvisionalPassword bool      `json:"provisionalPassword"`
	FinancialPass       bool      `json:"financialPass"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Token     string    `json:"-"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}
