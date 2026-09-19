package service

import (
	"context"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Varredura do bucket do Atlas: o que está lá e nenhuma linha do banco
// reivindica.
//
// A cascata do esquema apaga bem no banco e nunca alcança o R2. Hoje os
// caminhos de exclusão limpam os dois lados, mas resíduo continua nascendo de
// upload interrompido, de processamento que morre depois de recortar as folhas,
// e de qualquer defeito novo. Com 60 obras isso vira gigabyte sem ninguém ver.
//
// A regra de quais chaves o banco reivindica mora aqui, e não no comando de
// linha nem no agendador: duas cópias dela seria o jeito garantido de a
// varredura automática apagar o que a manual preserva.

// Orfao é um objeto do bucket sem dono no banco.
type Orfao struct {
	Key    string
	Size   int64
	Motivo string
}

// ResultadoVarredura é o que a rodada encontrou, e o que ela apagou.
type ResultadoVarredura struct {
	Objetos      int
	Bytes        int64
	Orfaos       []Orfao
	BytesOrfaos  int64
	Apagados     int
	Falhas       int
	BytesLiberad int64
}

// ChavesReivindicadas é tudo o que o banco aponta para o bucket.
func ChavesReivindicadas(ctx context.Context, db *pgxpool.Pool) (map[string]bool, error) {
	chaves := map[string]bool{}
	for _, q := range []string{
		`SELECT r2_key FROM atlas_document_version WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_media            WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_sheet            WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT thumb_key FROM atlas_sheet         WHERE COALESCE(thumb_key,'') <> ''`,
	} {
		rows, err := db.Query(ctx, q)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var k string
			if rows.Scan(&k) == nil {
				chaves[k] = true
			}
		}
		rows.Close()
	}
	return chaves, nil
}

// VarrerOrfaos lista o bucket e devolve o que ninguém reivindica. Com apagar
// falso, só conta: é o dry-run do comando de linha.
func VarrerOrfaos(
	ctx context.Context, db *pgxpool.Pool, r2 *R2Service, bucket string, apagar bool,
) (ResultadoVarredura, error) {
	var res ResultadoVarredura
	if r2 == nil || !r2.Configured() {
		return res, nil
	}

	vivas := map[string]string{}
	rows, err := db.Query(ctx, `SELECT id, name FROM atlas_jobsite`)
	if err != nil {
		return res, err
	}
	for rows.Next() {
		var id, nome string
		if rows.Scan(&id, &nome) == nil {
			vivas[id] = nome
		}
	}
	rows.Close()

	conhecidas, err := ChavesReivindicadas(ctx, db)
	if err != nil {
		return res, err
	}

	var token *string
	for {
		out, err := r2.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket), ContinuationToken: token,
		})
		if err != nil {
			return res, err
		}
		for _, o := range out.Contents {
			key := aws.ToString(o.Key)
			size := aws.ToInt64(o.Size)
			res.Objetos++
			res.Bytes += size
			if conhecidas[key] {
				continue
			}
			// O objeto do atlas-r2check nasce e morre na mesma execução.
			if strings.HasPrefix(key, "_healthcheck/") {
				continue
			}
			motivo := "sem linha no banco"
			if id := jobsiteDaChave(key); id != "" {
				if nome, viva := vivas[id]; viva {
					motivo = "obra viva (" + nome + "), objeto solto"
				} else {
					motivo = "obra apagada (" + id + ")"
				}
			}
			res.Orfaos = append(res.Orfaos, Orfao{Key: key, Size: size, Motivo: motivo})
			res.BytesOrfaos += size
		}
		if !aws.ToBool(out.IsTruncated) {
			break
		}
		token = out.NextContinuationToken
	}

	if !apagar {
		return res, nil
	}
	for _, o := range res.Orfaos {
		if err := r2.Delete(ctx, o.Key); err != nil {
			res.Falhas++
			continue
		}
		res.Apagados++
		res.BytesLiberad += o.Size
	}
	return res, nil
}

// jobsiteDaChave: toda chave do Atlas começa por `jobsites/<id>/`.
func jobsiteDaChave(key string) string {
	partes := strings.Split(key, "/")
	if len(partes) > 1 && partes[0] == "jobsites" {
		return partes[1]
	}
	return ""
}
