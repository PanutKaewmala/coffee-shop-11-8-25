# Coffee Shop SaaS MVP

A portfolio-style MVP for a small coffee shop business, built with Next.js, TypeScript, Supabase, and Tailwind CSS. The project combines a public-facing menu experience with internal tools for POS checkout, stock control, payments, admin management, and daily operations.

## 1. Demo-Ready Feature Highlights

- Public menu for customers
- POS checkout flow with cash and PromptPay payment handling
- Receipt modal and admin reprint support
- Admin dashboard for orders, stock, and daily operations
- Order cancellation with stock/restock handling
- Daily close workflow with post-close protection rules

## 2. Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- Tailwind CSS
- ESLint

## 3. Core Business Flows

- Customer-facing menu browsing
- Checkout and order creation
- Payment handling and receipt generation
- Order review and cancellation
- Ingredient and recipe-based stock updates
- Cash movement tracking and daily close management

## 4. Key Technical and Business Logic Highlights

- Multi-tenant structure for shops and branches
- Role-based behavior for Owner and Staff users
- Automatic stock deduction from POS checkout
- Stock history and audit-style tracking
- Post-close guards that block checkout, stock adjustments, cash movement, and order cancellation after daily close
- Responsive improvements for POS, dashboard, and orders screens

## 5. Main Modules / Screens

- Public shop and menu pages
- POS checkout experience
- Admin dashboard
- Orders list and order detail views
- Ingredients and recipe management
- Stock and cash movement views

## 6. How to Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000

Useful commands:

```bash
npm run build
npm run lint
```

## 7. Project Status

This is an MVP project built for learning, portfolio presentation, and practical feature exploration. It is not presented as production-ready software.

## 8. Next Improvements

Potential next steps include:

- adding automated tests for core flows
- improving reporting and analytics
- strengthening validation and error handling
- refining admin workflows for larger-scale operations
