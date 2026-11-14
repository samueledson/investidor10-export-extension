# Investidor10 Export Extension

Extensao Chrome para exportar as posicoes, lançamentos e proventos da carteira do Investidor10 em CSV e PDF.

## Recursos

- Exporta posicoes renderizadas na pagina de carteira do Investidor10.
- Mantém a exportação de posições em CSV/PDF nas carteiras Free e Pro, com o botão Expandir tudo e o atalho Abrir Posições no popup.
- Exporta todos os lançamentos da rota `/wallet/my-wallet/pro/entries`.
- Exporta os proventos detalhados da rota `/wallet/my-wallet/pro/earnings`, sem o resumo mensal.
- Percorre a paginação das tabelas e reúne os registros antes de gerar o arquivo.
- Gera CSV com separador `;`, adequado para planilhas em pt-BR.
- Gera PDF com resumo por tipo de ativo e tabelas com bordas.
- Permite expandir todos os tipos de ativo antes da exportacao.
- Mostra avisos no popup quando o contador do site diverge das linhas capturadas.
- Processa tudo localmente no navegador, sem enviar dados para servidores.

## Como usar

1. Abra `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em `Carregar sem compactacao`.
4. Selecione esta pasta.
5. Acesse a pagina de posicoes do Investidor10.
6. Abra o popup da extensao e exporte em CSV ou PDF.
7. Para lançamentos ou proventos, abra a aba correspondente da carteira e use os mesmos botões.

## Rotas suportadas

- `https://investidor10.com.br/wallet/my-wallet/positions`
- `https://investidor10.com.br/wallet/my-wallet/*/positions`
- `https://investidor10.com.br/wallet/my-wallet/free/positions`
- `https://investidor10.com.br/wallet/my-wallet/pro/positions`
- `https://investidor10.com.br/wallet/my-wallet/pro/entries`
- `https://investidor10.com.br/wallet/my-wallet/pro/earnings`

## Desenvolvimento

O projeto nao usa build. Os arquivos da extensao sao vanilla HTML, CSS e JavaScript.

Para validar sintaxe JavaScript:

```bash
node --check background.js
node --check popup.js
node --check content.js
```
