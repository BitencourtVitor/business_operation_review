package service

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Apagar é apagar dos dois lados.
//
// O esquema do Atlas apaga bem em cascata: remover uma obra leva documento,
// versão, folha, anotação, evento, resposta e mídia. Só que metade do que uma
// obra é não está no banco. As plantas, as fotos, as miniaturas e os recortes
// moram no R2, e nenhuma foreign key alcança um bucket.
//
// O resultado disso é lixo que ninguém consegue nomear: o objeto continua lá,
// pago, e a única linha que dizia de quem ele era acabou de ser apagada. Uma
// obra de 112 MB removida pela tela some da lista e continua ocupando o mesmo
// espaço para sempre.
//
// Por isso a coleta das chaves acontece **antes** de qualquer DELETE, e a
// exclusão no bucket vem antes da exclusão no banco. Na ordem inversa, uma falha
// no meio deixaria as chaves órfãs sem nenhum registro de quais eram, que é
// exatamente o estado impossível de consertar depois.
//
// A regra é uma só, e vale para toda escala: o armazenamento reflete o sistema.

// StorageKeys são as chaves de R2 que pendem de um escopo, e o que fazer com
// elas.
type StorageKeys struct {
	Keys []string
}

// JobsiteKeys junta toda chave que pende de uma obra: o arquivo de cada versão
// de documento, a mídia de evento e diário, e o par de folha (recorte e
// miniatura).
func JobsiteKeys(ctx context.Context, db *pgxpool.Pool, jobsiteID string) ([]string, error) {
	return collect(ctx, db, jobsiteID, []string{
		`SELECT v.r2_key FROM atlas_document_version v
		   JOIN atlas_document d ON d.id = v.document_id
		  WHERE d.jobsite_id = $1 AND COALESCE(v.r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_media WHERE jobsite_id = $1 AND COALESCE(r2_key,'') <> ''`,
		`SELECT s.r2_key FROM atlas_sheet s
		   JOIN atlas_document_version v ON v.id = s.version_id
		   JOIN atlas_document d ON d.id = v.document_id
		  WHERE d.jobsite_id = $1 AND COALESCE(s.r2_key,'') <> ''`,
		`SELECT s.thumb_key FROM atlas_sheet s
		   JOIN atlas_document_version v ON v.id = s.version_id
		   JOIN atlas_document d ON d.id = v.document_id
		  WHERE d.jobsite_id = $1 AND COALESCE(s.thumb_key,'') <> ''`,
	})
}

// DocumentKeys é o mesmo para uma pasta. A mídia não entra: ela pende do evento
// e da obra, não do documento, e um evento sobrevive à remoção de uma pasta.
func DocumentKeys(ctx context.Context, db *pgxpool.Pool, documentID string) ([]string, error) {
	return collect(ctx, db, documentID, []string{
		`SELECT r2_key FROM atlas_document_version
		  WHERE document_id = $1 AND COALESCE(r2_key,'') <> ''`,
		`SELECT s.r2_key FROM atlas_sheet s
		   JOIN atlas_document_version v ON v.id = s.version_id
		  WHERE v.document_id = $1 AND COALESCE(s.r2_key,'') <> ''`,
		`SELECT s.thumb_key FROM atlas_sheet s
		   JOIN atlas_document_version v ON v.id = s.version_id
		  WHERE v.document_id = $1 AND COALESCE(s.thumb_key,'') <> ''`,
	})
}

// VersionKeys é o escopo mais estreito: uma revisão e as folhas dela.
func VersionKeys(ctx context.Context, db *pgxpool.Pool, versionID string) ([]string, error) {
	return collect(ctx, db, versionID, []string{
		`SELECT r2_key FROM atlas_document_version
		  WHERE id = $1 AND COALESCE(r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_sheet
		  WHERE version_id = $1 AND COALESCE(r2_key,'') <> ''`,
		`SELECT thumb_key FROM atlas_sheet
		  WHERE version_id = $1 AND COALESCE(thumb_key,'') <> ''`,
	})
}

func collect(ctx context.Context, db *pgxpool.Pool, id string, queries []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, q := range queries {
		rows, err := db.Query(ctx, q, id)
		if err != nil {
			return nil, fmt.Errorf("coletar chaves: %w", err)
		}
		for rows.Next() {
			var k string
			if rows.Scan(&k) == nil && k != "" && !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
		rows.Close()
	}
	return out, nil
}

// PurgeResult conta o que saiu, para a resposta poder dizer o que foi feito em
// vez de um 204 mudo.
type PurgeResult struct {
	Deleted int      `json:"deleted"`
	Failed  []string `json:"failed,omitempty"`
}

// DeleteKeys apaga as chaves no bucket e **não interrompe na primeira falha**.
//
// Um objeto que resiste vira lixo pago, o que é ruim. Travar a exclusão por
// causa dele deixaria de pé justamente o registro que a pessoa mandou apagar, o
// que é pior: o usuário vê a operação falhar, tenta de novo, e o sistema segue
// mostrando uma obra que ele já removeu duas vezes. A chave que falhou volta na
// resposta para poder ser caçada depois, e o `atlas-r2-orphans` a encontra numa
// varredura seguinte de qualquer jeito.
func DeleteKeys(ctx context.Context, r2 *R2Service, keys []string) PurgeResult {
	res := PurgeResult{}
	if r2 == nil || !r2.Configured() {
		// Sem credencial não há o que apagar, e fingir que apagou seria pior do
		// que devolver zero: quem lê o resultado saberia que nada saiu.
		return res
	}
	for _, k := range keys {
		if err := r2.Delete(ctx, k); err != nil {
			res.Failed = append(res.Failed, k)
			continue
		}
		res.Deleted++
	}
	return res
}
