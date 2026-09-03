# Atlas no R2: como a cobrança funciona e quanto isso custa

Levantamento de 03/09/2026, feito para o AT-56. Preços colhidos da
[documentação de preço do R2](https://developers.cloudflare.com/r2/pricing/).

## Como o R2 cobra

Três coisas, e só três:

| Item | Preço | O que conta |
|---|---|---|
| Armazenamento | **US$ 0,015 por GB-mês** | média do pico diário ao longo de 30 dias |
| Operação classe A | **US$ 4,50 por milhão** | o que muda estado: `PUT`, `LIST`, criar bucket |
| Operação classe B | **US$ 0,36 por milhão** | o que lê estado: `GET`, `HEAD` |
| Saída de dados | **US$ 0** | nunca é cobrada, e é o motivo de o Atlas estar aqui |

O nível gratuito, por mês: **10 GB** de armazenamento, **1 milhão** de classe A e
**10 milhões** de classe B.

A saída gratuita é o ponto que decide. Um leitor abrindo pranchas o dia inteiro
em obra é tráfego de saída puro, e é exatamente o que os concorrentes cobram
caro: no S3 a mesma leitura sairia por volta de US$ 0,09 por GB.

## O que o Atlas guarda por folha

Três objetos, e cada um existe por um motivo diferente:

1. **o set original**, imutável, que é a verdade do que foi enviado;
2. **o recorte de uma página**, para abrir uma prancha custar 1,66 MB de mediana
   em vez dos 107 MB do set inteiro;
3. **a miniatura**, alguns kB, para a lista de folhas ser reconhecível.

O recorte infla o armazenado: medido em set real de 51 páginas e 107,2 MB, as
páginas somadas deram 532,5 MB, ou **4,97x**. É caro em bytes e barato em
dólares, e compra a única coisa que importa em campo, que é abrir a folha num
4G de obra em vez de desistir.

## Onde estamos hoje

Medido no banco de produção em 03/09/2026:

| | |
|---|---|
| Versões (originais) | 4 · 122,5 MB |
| Folhas (recortes) | 342 · 565,8 MB |
| Miniaturas | 342 · ~7 MB |
| **Total no bucket** | **~695 MB** |

Ou seja, **7% do nível gratuito**, e a conta é compartilhada com o PCG, que usa o
mesmo R2.

## A projeção

O que interessa é quantas obras cabem antes de a conta começar. Usando o set
medido como unidade, cada obra com um plan set completo custa por volta de
**640 MB** entre original, recortes e prévias.

| Obras com plan set | Armazenado | Custo por mês |
|---:|---:|---:|
| 15 | ~9,4 GB | **US$ 0** (dentro do gratuito) |
| 30 | ~19 GB | US$ 0,14 |
| 100 | ~63 GB | US$ 0,79 |
| 500 | ~313 GB | US$ 4,49 |

Operações não chegam perto de importar. Um envio de 97 páginas faz 195 `PUT`,
que são classe A: **5.128 envios desses** cabem no milhão gratuito por mês.
Leitura é classe B, dez milhões grátis, e cada abertura de prancha é um `GET`.

## O que muda essa conta

**Versionar por folha** ([AT-49](../../backlog/2026-09-03/AT-49.md)) é a única
coisa no roteiro que muda a ordem de grandeza: hoje um envio novo substitui o
anterior, e com histórico ele passa a acumular. Uma obra revisada cinco vezes
deixaria de custar 640 MB e passaria a custar 3,2 GB.

**Apagar a versão sobrescrita**, que ficou combinado e não foi implementado, é o
contrapeso disso. As duas decisões são a mesma decisão, e é por isso que a de
custo depende da de versionamento.

## Conclusão

Não há problema de custo à vista, e não vale gastar engenharia otimizando isto
agora: com 100 obras a conta é de **US$ 0,79 por mês**. O que merece atenção não
é o preço do byte, é a política de retenção, porque ela é a única variável capaz
de multiplicar o armazenado por cinco sem ninguém perceber.

Sources:
- [Pricing · Cloudflare R2 docs](https://developers.cloudflare.com/r2/pricing/)
