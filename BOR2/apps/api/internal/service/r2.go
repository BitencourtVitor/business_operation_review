package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// R2Service emite as URLs assinadas do Atlas e responde pelo que está no
// bucket.
//
// O arquivo pesado nunca atravessa esta API: um set de plantas de 112 MB
// subindo pelo serviço Go seria banda e memória jogadas fora. O cliente fala
// direto com o bucket; o backend só decide se assina ou não, e por quanto
// tempo. O bucket, sozinho, não autoriza ninguém.
type R2Service struct {
	client  *s3.Client
	presign *s3.PresignClient
	bucket  string
}

// ErrR2NotConfigured é o que sai quando as variáveis do R2 não estão no
// ambiente. Devolvido em vez de panic: o Atlas é um produto entre outros, e a
// API inteira não pode deixar de subir porque um bucket não foi provisionado.
var ErrR2NotConfigured = errors.New("r2: credenciais não configuradas")

func NewR2Service(endpoint, bucket, accessKey, secretKey string) *R2Service {
	if endpoint == "" || bucket == "" || accessKey == "" || secretKey == "" {
		return &R2Service{}
	}

	client := s3.New(s3.Options{
		// O R2 não tem região; "auto" é o valor que a Cloudflare documenta.
		Region:       "auto",
		BaseEndpoint: aws.String(endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			accessKey, secretKey, "",
		),
		// Caminho, não subdomínio: o endpoint do R2 já carrega o account id, e
		// o bucket entra no path.
		UsePathStyle: true,
	})

	return &R2Service{
		client:  client,
		presign: s3.NewPresignClient(client),
		bucket:  bucket,
	}
}

func (s *R2Service) Configured() bool { return s.client != nil }

// UploadURL assina um PUT para o cliente subir o arquivo direto no bucket.
//
// A validade é generosa de propósito: quem sobe um set de plantas está numa
// obra, com internet de obra, e uma assinatura de cinco minutos expira no meio
// do upload. Continua sendo uma URL de uma chave só, para um método só.
func (s *R2Service) UploadURL(ctx context.Context, key, contentType string, ttl time.Duration) (string, error) {
	if !s.Configured() {
		return "", ErrR2NotConfigured
	}
	if ttl <= 0 {
		ttl = 2 * time.Hour
	}
	out, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(defaultContentType(contentType)),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return out.URL, nil
}

// DownloadURL assina um GET. Vida curta: o link é para uma leitura agora, e um
// link de leitura que sobrevive ao turno vira acesso permanente vazado.
func (s *R2Service) DownloadURL(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if !s.Configured() {
		return "", ErrR2NotConfigured
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	out, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return out.URL, nil
}

// Stat devolve tamanho e content type do que está gravado. É o que fecha o
// ciclo do upload: o cliente avisa que terminou, e a versão só sai de "pending"
// depois que o objeto realmente existe no bucket com o tamanho declarado.
func (s *R2Service) Stat(ctx context.Context, key string) (int64, string, error) {
	if !s.Configured() {
		return 0, "", ErrR2NotConfigured
	}
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return 0, "", err
	}
	var size int64
	if out.ContentLength != nil {
		size = *out.ContentLength
	}
	var ctype string
	if out.ContentType != nil {
		ctype = *out.ContentType
	}
	return size, ctype, nil
}

func (s *R2Service) Delete(ctx context.Context, key string) error {
	if !s.Configured() {
		return ErrR2NotConfigured
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

// ── Convenção de chave ──────────────────────────────────────────────────────
//
// A chave carrega a hierarquia inteira porque um bucket não tem pasta: o
// prefixo é a única coisa que permite listar "tudo desta obra" ou apagar "tudo
// desta versão" sem consultar o banco. Versão entra na chave, não revisão: a
// revisão é texto que a obra escolhe ("rev 2", "REV.2") e não serve de
// endereço.

func DocumentKey(jobsiteID, documentID, versionID, fileName string) string {
	return fmt.Sprintf("jobsites/%s/documents/%s/versions/%s/%s",
		jobsiteID, documentID, versionID, safeName(fileName))
}

// ThumbKey é a prévia da folha: imagem pequena, gerada no navegador junto com o
// corte e usada onde a folha aparece em lista. Sem ela a lista de 51 páginas é
// uma coluna de números, e achar a prancha certa vira abrir uma por uma.
// Derivada como o recorte: pode ser refeita a qualquer momento.
func ThumbKey(jobsiteID, versionID string, pageIndex int) string {
	return fmt.Sprintf("jobsites/%s/versions/%s/thumbs/%04d.jpg",
		jobsiteID, versionID, pageIndex)
}

// PlanKey é o PDF de uma página só, recortado do original na ingestão.
//
// O original continua sendo a verdade; isto é derivado dele e existe pela
// leitura: 1,66 MB de mediana por página contra 107 MB do set inteiro. Se o
// objeto sumir, a folha ainda abre pelo original e o recorte pode ser refeito.
func PlanKey(jobsiteID, versionID string, pageIndex int) string {
	return fmt.Sprintf("jobsites/%s/versions/%s/plans/%04d.pdf",
		jobsiteID, versionID, pageIndex)
}

// PageCacheKey é o endereço do render sob demanda de uma folha (AT-13). O
// mecanismo que produz a imagem ainda não foi decidido; a convenção de onde ela
// mora, sim — e sai daqui para os dois lados da decisão poderem conviver.
func PageCacheKey(jobsiteID, versionID string, pageIndex, dpi int) string {
	return fmt.Sprintf("jobsites/%s/versions/%s/pages/%04d@%ddpi.jpg",
		jobsiteID, versionID, pageIndex, dpi)
}

func MediaKey(jobsiteID, mediaID, fileName string) string {
	return fmt.Sprintf("jobsites/%s/media/%s/%s", jobsiteID, mediaID, safeName(fileName))
}

// Nome de arquivo vindo do cliente não entra cru na chave: espaço, acento e
// barra viram endereço quebrado ou, pior, um caminho fora do prefixo da obra.
func safeName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "arquivo"
	}
	name = strings.ReplaceAll(name, "\\", "/")
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-.")
	if out == "" {
		return "arquivo"
	}
	if len(out) > 120 {
		out = out[len(out)-120:]
	}
	return out
}

func defaultContentType(ctype string) string {
	if strings.TrimSpace(ctype) == "" {
		return "application/octet-stream"
	}
	return ctype
}
