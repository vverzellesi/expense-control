# Data Models - Diagrama ER

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o{ Transaction : owns
    User ||--o{ Category : owns
    User ||--o{ RecurringExpense : owns
    User ||--o{ Installment : owns
    User ||--o{ Origin : owns
    User ||--o{ Budget : owns
    User ||--o{ CategoryRule : owns
    User ||--o{ Settings : owns
    User ||--o{ SavingsHistory : owns
    User ||--o{ InvestmentCategory : owns
    User ||--o{ Investment : owns
    User ||--o{ InvestmentSnapshot : owns
    User ||--o{ BillPayment : owns
    User ||--o{ Simulation : owns

    Category ||--o{ Transaction : categorizes
    Category ||--o{ Budget : limits
    Category ||--o{ CategoryRule : "matched by"
    Category ||--o{ RecurringExpense : categorizes
    Category ||--o{ Simulation : categorizes

    Installment ||--o{ Transaction : groups
    Installment ||--o| BillPayment : "financed by"

    RecurringExpense ||--o{ Transaction : generates

    InvestmentCategory ||--o{ Investment : classifies
    Investment ||--o{ InvestmentTransaction : tracks

    InvestmentTransaction ||--o| Transaction : "linked to"

    User {
        string id PK
        string name
        string email UK
        string hashedPassword
        datetime createdAt
        datetime updatedAt
    }

    Transaction {
        string id PK
        string description
        float amount
        datetime date
        string type "INCOME | EXPENSE"
        string origin
        string categoryId FK
        boolean isFixed
        boolean isInstallment
        string installmentId FK
        int currentInstallment
        string recurringExpenseId FK
        string tags "JSON array"
        datetime deletedAt "soft delete"
        string userId FK
    }

    Category {
        string id PK
        string name
        string color
        string icon
        string userId FK
    }

    RecurringExpense {
        string id PK
        string description
        float defaultAmount
        int dayOfMonth
        string type "INCOME | EXPENSE"
        string origin
        string categoryId FK
        boolean isActive
        boolean autoGenerate
        string userId FK
    }

    Installment {
        string id PK
        string description
        float totalAmount
        int totalInstallments
        float installmentAmount
        datetime startDate
        string origin
        string userId FK
    }

    Budget {
        string id PK
        string categoryId FK
        float amount
        boolean isActive
        string userId FK
    }

    CategoryRule {
        string id PK
        string keyword
        string categoryId FK
        string userId FK
    }

    Origin {
        string id PK
        string name
        string userId FK
    }

    Investment {
        string id PK
        string name
        string description
        string categoryId FK
        float currentValue
        float totalInvested
        float totalWithdrawn
        float goalAmount
        string broker
        string userId FK
    }

    InvestmentCategory {
        string id PK
        string name
        string color
        string icon
        boolean isDefault
        string userId FK
    }

    InvestmentTransaction {
        string id PK
        string investmentId FK
        string type "DEPOSIT | WITHDRAWAL"
        float amount
        datetime date
        string notes
        string linkedTransactionId FK
    }

    InvestmentSnapshot {
        string id PK
        int month
        int year
        float totalValue
        float totalInvested
        float totalWithdrawn
        string userId FK
    }

    BillPayment {
        string id PK
        int billMonth
        int billYear
        string origin
        float totalBillAmount
        float amountPaid
        float amountCarried
        string paymentType "PARTIAL | FINANCED"
        string installmentId FK
        float interestRate
        float interestAmount
        string userId FK
    }

    Simulation {
        string id PK
        string description
        float totalAmount
        int totalInstallments
        string categoryId FK
        boolean isActive
        string userId FK
    }

    SavingsHistory {
        string id PK
        int month
        int year
        float goal
        float actual
        boolean isAchieved
        float percentage
        string userId FK
    }

    Settings {
        string id PK
        string key
        string value
        string userId FK
    }

    Account {
        string id PK
        string userId FK
        string type
        string provider
        string providerAccountId
    }

    Session {
        string id PK
        string sessionToken UK
        string userId FK
        datetime expires
    }
```

Diagrama ER completo das 20 entidades Prisma. User e o hub central com relacionamentos 1:N para quase todas as entidades de dominio. Transaction e a entidade mais conectada, podendo pertencer a Category, Installment e RecurringExpense. O dominio de investimentos tem sua propria hierarquia (InvestmentCategory > Investment > InvestmentTransaction) com link para Transaction via linkedTransactionId.
