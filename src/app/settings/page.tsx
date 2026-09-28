"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { store } from "@/lib/store";
import { Users, Shield, Plus, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const [users, setUsers] = useState(store.users);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"MEMBER" | "VIEWER">("MEMBER");

  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;

    const newUser = {
      id: `usr-${Date.now()}`,
      email,
      name,
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      passwordHash: "hashed",
    };

    store.users.push(newUser);
    setUsers([...store.users]);
    setIsInviteOpen(false);
    setEmail("");
    setName("");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Household Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage multi-member household access, roles, and preferences.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Household Members ({users.length})</CardTitle>
              <CardDescription>Collaborative access to Kamasi Family OS</CardDescription>
            </div>
            <Button onClick={() => setIsInviteOpen(true)} className="gap-2 font-semibold">
              <Plus className="h-4 w-4" /> Invite Member
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, idx) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold flex items-center gap-3">
                      <span aria-label={`${u.name} avatar`} className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-semibold">{u.name.slice(0, 2).toUpperCase()}</span>
                      <span>{u.name}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={idx === 0 ? "default" : "secondary"}>
                        {idx === 0 ? "OWNER" : "MEMBER"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="success" className="text-[10px]">Active</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Invite Member Dialog */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogHeader>
            <DialogTitle>Invite Household Member</DialogTitle>
            <DialogDescription>Grant family members access to shared finances.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteMember} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Full Name</label>
              <Input required placeholder="e.g. Rohan Kamasi" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Email Address</label>
              <Input required type="email" placeholder="rohan@kamasi.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
              <Button type="submit">Send Invitation</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
