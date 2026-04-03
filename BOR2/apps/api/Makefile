.PHONY: dev build test lint migrate-up migrate-down

dev:
	go run ./cmd/api/...

build:
	go build -o bin/api ./cmd/api/...

test:
	go test ./... -v -race

lint:
	golangci-lint run ./...

migrate-up:
	migrate -path db/migrations -database "$$DATABASE_URL" up

migrate-down:
	migrate -path db/migrations -database "$$DATABASE_URL" down 1

migrate-create:
	migrate create -ext sql -dir db/migrations -seq $(name)

sqlc-generate:
	sqlc generate
