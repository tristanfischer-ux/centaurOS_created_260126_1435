
import { login } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center text-amber-600">CentaurOS</CardTitle>
                    <CardDescription className="text-center">
                        Enter your email to sign in to your Foundry
                    </CardDescription>
                </CardHeader>
                <form>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="m@example.com" defaultValue="demo@centauros.app" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" defaultValue="password123" required />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button formAction={login} className="w-full bg-slate-900 hover:bg-slate-800 text-white">Sign In</Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
