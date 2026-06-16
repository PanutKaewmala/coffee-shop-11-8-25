export default function RootLandingPage() {
    return (
        <main className="flex flex-col min-h-screen font-sans bg-background text-foreground transition-colors duration-300">
            <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
                <div className="max-w-2xl mx-auto space-y-6">
                    <h1 className="text-4xl md:text-5xl font-bold">Coffee SaaS</h1>
                    <p className="text-lg text-text-secondary">
                        Multi-tenant coffee shop management system. Manage menus, branches, and orders
                        across multiple locations with our modern POS platform.
                    </p>
                    <div className="flex flex-wrap gap-4 justify-center pt-6">
                        <a
                            href="/coffeespace-a"
                            className="px-6 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-accent to-accent-dark transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace A
                        </a>
                        <a
                            href="/coffeespace-b"
                            className="px-6 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-accent to-accent-dark transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace B
                        </a>
                        <a
                            href="/coffeespace-c"
                            className="px-6 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-accent to-accent-dark transition-all duration-300 hover:brightness-110"
                        >
                            CoffeeSpace C
                        </a>
                    </div>
                    <div className="pt-4">
                        <a
                            href="/login"
                            className="px-6 py-3 rounded-full font-semibold border border-accent text-accent transition-all duration-300 hover:bg-accent/10"
                        >
                            Login to Admin
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}