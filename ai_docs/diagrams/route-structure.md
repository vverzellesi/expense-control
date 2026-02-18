# Route Structure - Mapa de Rotas

```mermaid
flowchart TB
    subgraph PUBLIC["Rotas Publicas"]
        LP["/ Landing Page"]
        LOGIN["/auth/login"]
        REGISTER["/auth/register"]
        FORGOT["/auth/forgot-password"]
        AUTHERR["/auth/error"]
    end

    subgraph AUTH_API["API Auth - Publicas"]
        NEXTAUTH["/api/auth/[...nextauth] GET POST"]
        REG_API["/api/auth/register POST"]
        FORGOT_API["/api/auth/forgot-password POST"]
        VERIFY_API["/api/auth/verify-reset-code POST"]
        RESET_API["/api/auth/reset-password POST"]
    end

    subgraph PROTECTED["Paginas Protegidas"]
        DASH["/dashboard"]
        TRANS["/transactions"]
        INSTALL["/installments"]
        RECUR["/recurring"]
        TRASH["/trash"]
        CATS["/categories"]
        SETTINGS["/settings"]
        IMPORT["/import"]
        INV["/investments"]
        INV_ID["/investments/[id]"]
        BILLS["/bills"]
        REPORTS["/reports"]
        PROJ["/projection"]
        SIM["/simulador"]
    end

    subgraph TX_API["API Transacoes"]
        T1["/api/transactions GET POST"]
        T2["/api/transactions/[id] GET PUT DELETE"]
        T3["/api/transactions/[id]/make-recurring POST"]
        T4["/api/transactions/trash GET PUT DELETE"]
        T5["/api/transactions/unusual GET"]
        T6["/api/transactions/check-duplicates POST"]
    end

    subgraph CAT_API["API Categorias & Regras"]
        C1["/api/categories GET POST"]
        C2["/api/categories/[id] GET PUT DELETE"]
        C3["/api/rules GET POST DELETE"]
    end

    subgraph REC_API["API Recorrentes"]
        R1["/api/recurring GET POST"]
        R2["/api/recurring/[id] GET PUT DELETE"]
        R3["/api/recurring/[id]/generate POST"]
        R4["/api/recurring/pending GET"]
        R5["/api/recurring/suggestions GET"]
    end

    subgraph INV_API["API Investimentos"]
        I1["/api/investments GET POST"]
        I2["/api/investments/[id] GET PUT DELETE"]
        I3["/api/investments/[id]/deposit POST"]
        I4["/api/investments/[id]/withdraw POST"]
        I5["/api/investments/[id]/value PUT"]
        I6["/api/investments/summary GET"]
        I7["/api/investments/snapshots GET"]
        I8["/api/investment-categories GET POST"]
        I9["/api/investment-categories/[id] DELETE"]
    end

    subgraph BILL_API["API Faturas"]
        B1["/api/bills GET"]
        B2["/api/bill-payments GET POST"]
        B3["/api/bill-payments/[id] GET PUT DELETE"]
    end

    subgraph REPORT_API["API Relatorios"]
        RP1["/api/reports/annual GET"]
        RP2["/api/reports/calendar GET"]
        RP3["/api/reports/category-trends GET"]
        RP4["/api/reports/fixed-variable GET"]
        RP5["/api/reports/installments GET"]
        RP6["/api/reports/net-worth GET"]
        RP7["/api/reports/origins GET"]
        RP8["/api/reports/recurring-growth GET"]
    end

    subgraph MISC_API["API Outros"]
        M1["/api/summary GET"]
        M2["/api/projection GET"]
        M3["/api/simulation/data GET"]
        M4["/api/simulations GET POST"]
        M5["/api/simulations/[id] PATCH DELETE"]
        M6["/api/import POST"]
        M7["/api/export GET"]
        M8["/api/ocr POST"]
        M9["/api/settings GET POST DELETE"]
        M10["/api/origins GET POST PUT DELETE"]
        M11["/api/savings-history GET POST"]
        M12["/api/budgets GET POST DELETE"]
        M13["/api/installments GET DELETE"]
    end

    MW{{"Middleware: NextAuth"}}
    MW -->|"bloqueia sem sessao"| PROTECTED
    MW -->|"permite"| PUBLIC
    MW -->|"permite"| AUTH_API
```

Mapa completo de rotas: 5 paginas publicas, 14 protegidas, 5 endpoints de API publicos (auth) e 46 protegidos. O middleware NextAuth intercepta todas as requisicoes e redireciona usuarios nao autenticados para /auth/login. Endpoints protegidos tambem validam sessao via getAuthenticatedUserId().
