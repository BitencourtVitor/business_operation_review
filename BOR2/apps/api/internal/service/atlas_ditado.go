package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// A descrição falada do problema, virando texto.
//
// Em obra ninguém digita parágrafo. A pessoa está de luva, com o celular numa
// mão e a lanterna na outra, olhando para a viga que está errada. Falar é o
// único registro que ela consegue fazer sem largar o que está fazendo, e por
// isso a descrição do ponto nasce como áudio.
//
// O áudio sozinho, porém, não serve para nada depois: ninguém abre quarenta
// gravações para montar a lista do que falta, e o relatório que vai para o
// cliente não pode ser uma pasta de arquivos .wav. Então o áudio é insumo, e o
// que fica é o texto.
//
// ── Duas etapas, e não uma ──
//
// Primeiro a transcrição, palavra por palavra, do que foi dito. Depois os
// tópicos, que é a leitura do que foi dito. Poderia ser uma chamada só, e seria
// pior: a transcrição é o que permite conferir a leitura quando ela sai errada,
// e ela sai errada em canteiro barulhento, com dois idiomas na mesma frase e
// jargão que nenhum dicionário tem. Guardar as duas coisas separadas é o que
// deixa alguém apontar "não foi isso que eu falei" e ter como provar.
//
// ── Os dois idiomas ──
//
// O pessoal de campo fala inglês americano e português, e mistura os dois na
// mesma frase: "o king stud tá fora de esquadro". Forçar um idioma na
// transcrição é justamente o que estraga esse caso, então nada é forçado. O
// modelo recebe o áudio e escreve o que ouviu, na língua em que foi dito.
//
// Os tópicos saem em inglês, porque é a língua do resto do Atlas e do relatório
// que chega ao cliente. A transcrição fica na língua falada.
// Dois modelos, e não um.
//
// Ouvir e ler são trabalhos diferentes e custam diferente. Medido com a mesma
// gravação: o modelo rápido transcreveu em 4 segundos e perdeu o número da folha
// e o "king stud"; o modelo grande levou 37 segundos e trouxe a frase inteira.
// Numa descrição de ponto, perder o número da folha é perder o registro.
//
// Já os tópicos partem de um texto curto que já está pronto, e aí o modelo
// rápido faz o mesmo serviço em um segundo. Então a transcrição é feita pelo
// grande e a leitura pelo rápido, cada um onde ele ganha.
type DitadoService struct {
	// Ouve o áudio. Precisa aceitar som na entrada, o que nem todo modelo aceita.
	llm *OpenRouterClient
	// Lê a transcrição e escreve os tópicos. Texto puro.
	leitor *OpenRouterClient
	http   *http.Client
}

func NewDitadoService(apiKey, model, modeloDeTexto string) *DitadoService {
	return &DitadoService{
		llm:    NewOpenRouterClient(apiKey, model),
		leitor: NewOpenRouterClient(apiKey, modeloDeTexto),
		// O áudio de campo passa por aqui duas vezes, uma para baixar do bucket e
		// outra para subir ao modelo. Dois minutos é folga para gravação longa em
		// rede de obra, sem deixar a requisição pendurada para sempre.
		http: &http.Client{Timeout: 2 * time.Minute},
	}
}

// Configurado diz se há credencial para falar com o modelo. Sem ela o ditado
// recusa em vez de fingir que transcreveu.
func (s *DitadoService) Configurado() bool { return s.llm != nil && s.llm.apiKey != "" }

// ContextoDaObra é o que o agente precisa saber para ler o que foi falado.
//
// Nada aqui é adivinhado: o tipo de construção, a categoria da pasta e o número
// da folha já estão gravados desde que o ponto nasceu. Mandar isso junto é de
// graça e é o que separa "painel" de "painel elétrico".
type ContextoDaObra struct {
	Obra       string
	TipoDeObra string
	Categoria  string
	Pasta      string
	Folha      string
}

// BaixarAudio traz o arquivo do bucket pela URL assinada.
//
// Passa pelo servidor de propósito. O modelo precisa dos bytes, e mandar o
// cliente subir o áudio duas vezes, uma para o bucket e outra para cá, gastaria
// o dobro do dado móvel de quem está em obra.
func (s *DitadoService) BaixarAudio(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ditado: bucket devolveu %d", resp.StatusCode)
	}
	// Teto de 25 MB. Em WAV de 16 kHz mono, que é o que o aparelho manda, isso é
	// mais de doze minutos de fala: muito além de qualquer descrição de ponto, e
	// baixo o bastante para um arquivo estranho não derrubar o processo.
	return io.ReadAll(io.LimitReader(resp.Body, 25<<20))
}

// FormatoDoAudio traduz o content type para o nome que o modelo espera.
//
// Vazio quando o formato não é aceito, e aí o chamador recusa antes de gastar a
// chamada. O aparelho converte para WAV de 16 kHz antes de subir, então o caso
// comum é sempre o primeiro.
func FormatoDoAudio(contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	switch {
	case strings.Contains(ct, "wav"), strings.Contains(ct, "wave"):
		return "wav"
	case strings.Contains(ct, "mpeg"), strings.Contains(ct, "mp3"):
		return "mp3"
	default:
		return ""
	}
}

// O prompt da transcrição não descreve o que se espera ouvir, e isso é de
// propósito.
//
// A primeira versão listava o jargão de framing para ajudar o modelo a escrever
// "king stud" e não "king stood". O efeito foi o oposto do pretendido: posto
// diante de um arquivo sem fala nenhuma, o modelo escreveu um parágrafo inteiro
// e convincente sobre montagem de parede, com medidas e tudo, porque o prompt
// lhe havia dito qual era o assunto. Num punch list isso é o pior defeito
// possível: o texto inventado entra no relatório que vai ao cliente com a mesma
// cara do texto verdadeiro, e ninguém tem como saber qual é qual.
//
// Então o prompt diz o mínimo sobre o conteúdo, diz que silêncio é resposta
// válida, e a leitura é feita com temperatura zero.
const promptTranscricao = `Transcribe this recording word for word.

Write only what you actually hear. Keep the language that was spoken: it may be American English, Brazilian Portuguese, or both in the same sentence. Never translate, never summarise, never complete a sentence that was cut off, never add a word that was not said.

If the recording has no intelligible speech, or only noise, music or silence, answer with exactly: [no speech]

Return the transcription only, with no preamble and no quotation marks.`

// A resposta quando não havia fala. Vale como resultado e não como erro: o
// aparelho grava um segundo de nada quando alguém encosta no botão sem querer, e
// isso não é falha de nada.
const SemFala = "[no speech]"

// Transcrever devolve o que foi dito, palavra por palavra.
func (s *DitadoService) Transcrever(ctx context.Context, audio []byte, formato string) (string, error) {
	if !s.Configurado() {
		return "", fmt.Errorf("ditado: sem credencial de IA")
	}
	if formato == "" {
		return "", fmt.Errorf("ditado: formato de áudio não aceito")
	}
	dados := base64.StdEncoding.EncodeToString(audio)
	resp, err := s.llm.ChatAudio(ctx, promptTranscricao, dados, formato)
	if err != nil {
		return "", err
	}
	texto := strings.TrimSpace(resp.Text)
	if strings.EqualFold(texto, SemFala) {
		return "", nil
	}
	return texto, nil
}

// Topicos lê a transcrição e devolve o que ela diz, em tópicos curtos.
//
// O resultado é rascunho, e quem registrou confirma antes de virar o corpo do
// ponto. Tópico errado que entra sozinho no relatório é pior que nenhum tópico,
// porque ninguém mais confere o que o sistema escreveu por conta própria.
func (s *DitadoService) Topicos(ctx context.Context, transcricao string, ctxObra ContextoDaObra) (string, error) {
	if !s.Configurado() {
		return "", fmt.Errorf("ditado: sem credencial de IA")
	}
	if strings.TrimSpace(transcricao) == "" {
		return "", nil
	}
	var b strings.Builder
	b.WriteString("This is a punch list item on a wood framing job.\n")
	if ctxObra.Obra != "" {
		b.WriteString("Jobsite: " + ctxObra.Obra + "\n")
	}
	if ctxObra.TipoDeObra != "" {
		b.WriteString("Build type: " + ctxObra.TipoDeObra + "\n")
	}
	if ctxObra.Categoria != "" {
		b.WriteString("Drawing category: " + ctxObra.Categoria + "\n")
	}
	if ctxObra.Pasta != "" {
		b.WriteString("Folder: " + ctxObra.Pasta + "\n")
	}
	if ctxObra.Folha != "" {
		b.WriteString("Sheet: " + ctxObra.Folha + "\n")
	}
	b.WriteString("\nWhat the inspector said, transcribed verbatim:\n")
	b.WriteString(transcricao)

	mensagens := []ChatMessage{
		{Role: "system", Content: promptTopicos},
		{Role: "user", Content: b.String()},
	}
	resp, err := s.leitor.Chat(ctx, mensagens)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(resp.Text), nil
}

const promptTopicos = `You turn a spoken punch list note into short written topics.

The world is wood framing: houses, multi-family buildings and prefabricated wall panels. Everything you read happens in that world, so read it that way. "Panel" is a wall panel, not an electrical panel. "Plate" is a top or bottom plate.

Rules:
- Write in American English, whatever language the note was spoken in.
- One topic per line, starting with "- ".
- At most five topics. Fewer is better. One is fine.
- Each topic is a short sentence, under 14 words, naming what is wrong and where.
- Keep every number, measurement and sheet reference exactly as said.
- Keep framing jargon. Do not translate it into plain language.
- Never invent a cause, a fix, a responsible party or a deadline that was not said.
- If the note says nothing about a problem, return a single topic describing what was said.

Return the topics only, with no heading and no closing remark.`
