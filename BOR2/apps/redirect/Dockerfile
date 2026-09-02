# O contexto de build é a raiz do repositório: este serviço não tem diretório
# raiz próprio no Railway, é apontado por RAILWAY_DOCKERFILE_PATH. Por isso os
# caminhos abaixo são completos.
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY BOR2/apps/redirect/main.go .
RUN go mod init redirect && CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /out/redirect .

FROM alpine:3.21
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /out/redirect .
CMD ["./redirect"]
