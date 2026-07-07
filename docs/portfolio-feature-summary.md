# Coffee Shop SaaS MVP Feature Summary

## 1. Project Overview

This project is a Next.js, TypeScript, Supabase, and Tailwind CSS MVP for a small coffee shop business. It was built as a practical web application that combines a customer-facing experience with internal operations such as order handling, stock management, payments, and admin workflows.

The goal of the project was to explore how a small retail business could use a simple SaaS-style platform to manage daily operations in one place. The result is a working MVP that demonstrates both frontend usability and backend business logic.

## 2. Problem It Solves

Small coffee shops often need a lightweight system to manage several connected tasks at once:

- showing a public menu for customers
- processing orders quickly at the point of sale
- handling payments in a clear and organized way
- tracking inventory and ingredients
- managing daily business operations without relying on scattered tools

This project addresses that need by bringing these workflows into a single application, with a focus on clarity, reliability, and a practical user experience.

## 3. Core Features

The application includes a range of features that support both customer-facing and internal operations:

- Public menu experience for viewing available products
- POS checkout flow for creating and completing orders
- Cash and PromptPay payment handling
- Receipt modal and admin reprint support for completed orders
- Admin dashboard for business oversight
- Orders list and order detail views
- Order cancellation with stock adjustment logic
- Ingredients management
- Recipes linked to menu variants
- Automatic stock deduction during checkout
- Stock history and audit-style tracking
- Cash movements tracking
- Daily close workflow
- Post-close guards that block certain actions after a daily close
- Role-based behavior for Owner and Staff users
- Multi-tenant structure for shops and branches

## 4. Technical Highlights

From a technical perspective, this project shows a solid foundation in modern web application development:

- Built with Next.js and TypeScript for a structured, component-based frontend
- Used Supabase as the backend data layer for storing core business data
- Implemented server-side logic and API routes for order, stock, and admin workflows
- Structured the app around reusable UI components and route-based screens
- Applied Tailwind CSS for responsive styling and a cleaner UI experience
- Organized business logic around real operational flows rather than only basic CRUD screens

The project also demonstrates an understanding of how frontend and backend concerns need to work together in a real application, especially when business rules are involved.

## 5. Business Logic Highlights

One of the strongest parts of this project is the business logic behind everyday operations. The app does more than simply store data; it reflects how a coffee shop actually works.

Examples include:

- Stock is deducted automatically when a POS order is completed
- Recipes and ingredients are connected so menu items affect inventory in a meaningful way
- Order cancellation includes restocking logic, which helps keep inventory data consistent
- Daily close creates a boundary for business operations and prevents later changes that could confuse reporting
- Owner and Staff roles influence which actions are allowed, which is important for practical team workflows

These behaviors show that I was thinking beyond basic UI development and focused on the rules that make the system useful in a real business setting.

## 6. Data Correctness / Guard Rails

A key part of this MVP is the effort to protect data integrity. Several guard rails were built into the flow to reduce errors and avoid inconsistent records.

Examples include:

- Post-close restrictions block checkout, stock adjustment, cash movement, and order cancellation after a daily close
- Inventory-related actions are tied to order and stock history so changes are easier to audit
- Role-based rules help ensure that only appropriate users can perform sensitive actions
- Business logic was implemented to keep stock, orders, and daily records from drifting out of sync

While the project is still an MVP, these guard rails show a practical awareness of correctness, accountability, and operational safety.

## 7. Responsive UX Improvements

A major focus of the project was improving the experience across devices, particularly for day-to-day operations.

The UI and workflows were adjusted to be more usable on mobile and smaller screens, especially in areas such as:

- POS screens
- Admin dashboard views
- Orders pages

This matters because many real-world shop operations happen on a phone or tablet rather than a desktop computer. The responsive improvements make the app feel more realistic and usable for actual business scenarios.

## 8. Tech Stack

This project was built using:

- Next.js
- React
- TypeScript
- Supabase
- Tailwind CSS
- REST-style API routes and server-side logic

These tools were chosen to build a modern, maintainable MVP with a strong balance of speed, clarity, and practical functionality.

## 9. What I Learned

Working on this project gave me valuable experience in several areas:

- planning and building a multi-step business workflow
- connecting a frontend app to a real backend database
- handling business rules that affect inventory and operations
- thinking about user roles and access control
- improving the user experience for mobile and tablet use
- debugging issues that arise when data and operations need to stay consistent

It also helped me develop a more realistic understanding of what it means to build software that supports actual business needs rather than just static pages or simple CRUD interfaces.

## 10. Next Improvements

This project is a strong foundation, but there is still room to grow. Some next steps would include:

- adding automated tests for core flows
- improving reporting and analytics
- strengthening error handling and validation
- expanding authentication and permission controls
- refining the admin experience for larger-scale operations

Overall, this project reflects a practical, junior-friendly approach to building a real-world SaaS-style application with a clear business purpose. It is not presented as a fully production-ready platform, but it does show solid initiative, growing technical ability, and an understanding of how software can support everyday business operations.
