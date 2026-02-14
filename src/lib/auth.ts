import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async session({ session, token }) {
            if (session.user && token.sub) {
                // Add the user ID to the session so we can use it for DB queries
                // Note: We'll cast this in usage or extend the types if needed
                (session.user as any).id = token.sub;
            }
            return session;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        }
    },
    secret: process.env.NEXTAUTH_SECRET,
};
