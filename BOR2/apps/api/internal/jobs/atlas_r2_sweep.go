package jobs

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// AtlasR2Sweep apaga, uma vez por mês, o que sobrou no bucket sem dono no banco.
//
// Os caminhos de exclusão já limpam os dois lados, mas resíduo continua
// nascendo de upload interrompido e de processamento que morre depois de
// recortar as folhas. Sem varredura, isso só aparece na fatura.
//
// Toda rodada que apaga alguma coisa vira linha em `audit_logs`: limpeza
// automática que não deixa rastro é indistinguível de perda de arquivo.
func AtlasR2Sweep(db *pgxpool.Pool, r2 *service.R2Service, bucket string) Job {
	return Job{
		Name:      "atlas-r2-sweep",
		DailyHour: 6,
		Run: func(ctx context.Context) error {
			// Mensal, no dia 1: o agendador só sabe rodar diariamente, e varrer
			// o bucket todo dia é pedir listagem de milhares de objetos para
			// não achar nada.
			if time.Now().UTC().Day() != 1 {
				return nil
			}
			res, err := service.VarrerOrfaos(ctx, db, r2, bucket, true)
			if err != nil {
				return err
			}
			logger.Info("atlas r2 sweep",
				"objetos", res.Objetos, "orfaos", len(res.Orfaos),
				"apagados", res.Apagados, "falhas", res.Falhas,
				"liberado_mb", res.BytesLiberad/1048576)
			if res.Apagados == 0 && res.Falhas == 0 {
				return nil
			}
			return registrarNaAuditoria(ctx, db, res)
		},
	}
}

func registrarNaAuditoria(ctx context.Context, db *pgxpool.Pool, res service.ResultadoVarredura) error {
	// As chaves vão junto, com teto: é o que permite conferir depois o que
	// sumiu. Lista inteira de milhares de chaves não cabe num registro de
	// auditoria e ninguém leria.
	chaves := make([]string, 0, 50)
	for i, o := range res.Orfaos {
		if i == 50 {
			break
		}
		chaves = append(chaves, o.Key)
	}
	payload, err := json.Marshal(map[string]any{
		"objetos_no_bucket": res.Objetos,
		"orfaos":            len(res.Orfaos),
		"apagados":          res.Apagados,
		"falhas":            res.Falhas,
		"bytes_liberados":   res.BytesLiberad,
		"chaves":            chaves,
		"chaves_omitidas":   max(0, len(res.Orfaos)-len(chaves)),
	})
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
		INSERT INTO audit_logs (user_id, user_name, action, resource, resource_id, payload, source)
		VALUES ('', 'atlas-r2-sweep', 'purge', 'atlas_r2', '', $1, 'scheduler')`, payload)
	return err
}
