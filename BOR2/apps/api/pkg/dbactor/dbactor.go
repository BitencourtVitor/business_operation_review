// Package dbactor leva a identidade de quem escreve até o banco.
//
// A auditoria de linha (migração 000124) grava quem alterou a partir de
// variáveis de sessão do Postgres. Elas só valem dentro de uma transação
// (SET LOCAL): fora dela, a conexão volta para o pool carregando a identidade
// do último request, e o registro seguinte sairia assinado pela pessoa errada —
// que é pior do que sair sem assinatura.
//
// Por isso a escrita identificada acontece sempre dentro de Do(): abre
// transação, declara quem é, executa, confirma.
package dbactor

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type key struct{}

// Actor é quem está por trás da escrita. Source diz por qual caminho ela veio:
// 'api' para requisição autenticada, 'script' para carregador, 'sync' para
// integração automática.
type Actor struct {
	ID     string
	Name   string
	Source string
}

// With guarda o ator no contexto — o middleware faz isso uma vez por request.
func With(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, key{}, a)
}

// From devolve o ator do contexto. Sem ator, a escrita é registrada como
// 'unknown', e isso é deliberado: aparece na auditoria e dá para medir quanto
// do sistema ainda escreve sem se identificar.
func From(ctx context.Context) Actor {
	if a, ok := ctx.Value(key{}).(Actor); ok {
		return a
	}
	return Actor{Source: "unknown"}
}

// Do executa fn numa transação que declara o ator para os triggers de
// auditoria. Toda escrita que precisa de autoria passa por aqui.
func Do(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	a := From(ctx)
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `
		SELECT set_config('bor.actor_id', $1, true),
		       set_config('bor.actor_name', $2, true),
		       set_config('bor.source', $3, true)
	`, a.ID, a.Name, a.Source); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
