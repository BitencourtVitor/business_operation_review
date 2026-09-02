# Contexto de build é esta pasta: o serviço tem diretório raiz próprio no
# Railway (BOR2/apps/redirect), como os demais do projeto.
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY main.go .
RUN go mod init redirect && CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /out/redirect .

FROM alpine:3.21
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /out/redirect .
CMD ["./redirect"]
