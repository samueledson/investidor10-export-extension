# Investidor10 Export Extension

Extensao Chrome para exportar as posicoes da carteira do Investidor10 em CSV e PDF.

## Recursos

- Exporta posicoes renderizadas na pagina de carteira do Investidor10.
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

## Rotas suportadas

- `https://investidor10.com.br/wallet/my-wallet/positions`
- `https://investidor10.com.br/wallet/my-wallet/*/positions`

## Desenvolvimento

O projeto nao usa build. Os arquivos da extensao sao vanilla HTML, CSS e JavaScript.

Para validar sintaxe JavaScript:

```bash
node --check background.js
node --check popup.js
node --check content.js
```
