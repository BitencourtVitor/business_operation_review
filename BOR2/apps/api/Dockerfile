FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY api .

EXPOSE 8080

CMD ["./api"]
