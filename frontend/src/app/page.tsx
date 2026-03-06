"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "CLIENTE") router.replace("/cliente");
    else if (user.role === "ADMIN") router.replace("/admin");
    else if (user.role === "GESTOR_PROJETOS") router.replace("/gestor");
    else router.replace("/consultor");
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <p className="text-blue-700">Carregando...</p>
    </div>
  );
}
