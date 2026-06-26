import Link from "next/link";

export default function SaasLandingPage() {
    return (
        <main className="flex flex-col min-h-screen font-sans bg-background text-foreground transition-colors duration-300">
            {/* Hero Section */}
            <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
                <div className="max-w-2xl mx-auto space-y-6">
                    <h1 className="text-4xl md:text-5xl font-bold">Coffee SaaS</h1>
                    <p className="text-lg text-text-secondary">
                        Multi-tenant coffee shop management system. Manage menus, branches, and orders
                        across multiple locations with our modern POS platform.
                    </p>
                    <div className="pt-4">
                        <Link
                            href="/#demo-shops"
                            className="px-6 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-accent to-accent-dark transition-all duration-300 hover:brightness-110"
                        >
                            View Demo Shops
                        </Link>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-16 px-4 bg-surface/50">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="p-6 rounded-2xl bg-surface shadow-sm">
                            <h3 className="text-xl font-semibold mb-3">Multi-Tenant</h3>
                            <p className="text-text-secondary">
                                Manage multiple coffee shops under one platform with isolated data and branding.
                            </p>
                        </div>
                        <div className="p-6 rounded-2xl bg-surface shadow-sm">
                            <h3 className="text-xl font-semibold mb-3">Menu Management</h3>
                            <p className="text-text-secondary">
                                Create and customize menus with categories, variants, and pricing per branch.
                            </p>
                        </div>
                        <div className="p-6 rounded-2xl bg-surface shadow-sm">
                            <h3 className="text-xl font-semibold mb-3">Order Tracking</h3>
                            <p className="text-text-secondary">
                                Track orders in real-time and manage inventory across all locations.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Demo Shops Section */}
            <section id="demo-shops" className="py-16 px-4">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-12">Demo Shops</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <Link
                            href="/coffeespace-a"
                            className="p-6 rounded-2xl bg-gradient-to-r from-accent to-accent-dark text-white text-center transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace A
                        </Link>
                        <Link
                            href="/coffeespace-b"
                            className="p-6 rounded-2xl bg-gradient-to-r from-accent to-accent-dark text-white text-center transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace B
                        </Link>
                        <Link
                            href="/coffeespace-c"
                            className="p-6 rounded-2xl bg-gradient-to-r from-accent to-accent-dark text-white text-center transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace C
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}