"use client";

import { useEffect, useState } from "react";
import { Briefcase, CheckCircle2, DollarSign, RefreshCw, Search, Shield, Tag, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { listProviders, type ProviderProfileDto } from "@/lib/api/endpoints";

export function TalentRegistryView() {
  const [providers, setProviders] = useState<ProviderProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadRegistry = async () => {
    setLoading(true);
    try {
      const res = await listProviders();
      if (!res.error && res.data) {
        setProviders(res.data);
      }
    } catch (err) {
      console.error("Failed to load talent registry:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRegistry();
  }, []);

  const filtered = providers.filter((p) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const nameMatch = p.displayName.toLowerCase().includes(query);
    const bioMatch = p.bio?.toLowerCase().includes(query);
    const tagMatch = p.capabilities.some((c) => c.tag.toLowerCase().includes(query));
    return nameMatch || bioMatch || tagMatch;
  });

  return (
    <div className="grid gap-4">
      {/* Search and stats bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by skill, capability, or name..."
            className="pl-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-4 w-4 text-primary" />
          <span>{filtered.length} Verified Providers Registered</span>
          <button
            type="button"
            onClick={loadRegistry}
            className="hover:text-foreground p-1"
            title="Refresh registry"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {loading && providers.length === 0 ? (
        <Card className="border-border/80 shadow-xs">
          <CardContent className="p-8 flex items-center justify-center gap-3 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <span>Querying open provider registry...</span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-border/80 shadow-xs">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No providers matched your filter criteria.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="border-border/80 shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4 text-primary shrink-0" />
                      <span>{p.displayName}</span>
                    </CardTitle>
                    <span className="text-[11px] font-mono text-muted-foreground mt-0.5 block">
                      ID: {p.id}
                    </span>
                  </div>
                  <StatusBadge tone="success">{p.status}</StatusBadge>
                </div>
                {p.bio && (
                  <CardDescription className="text-xs mt-1.5 line-clamp-2 leading-relaxed">
                    {p.bio}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="p-4 grid gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Target Rate:</span>
                  <span className="font-semibold font-mono text-foreground flex items-center">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600 -mr-0.5" />
                    {p.hourlyRateMinor ? `${Math.round(p.hourlyRateMinor / 100)} / hr` : "Flexible"}
                  </span>
                </div>

                <div className="grid gap-1.5 pt-2 border-t border-border/40">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3 w-3 text-primary" />
                    Specialized Capabilities:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {p.capabilities.length > 0 ? (
                      p.capabilities.map((c) => (
                        <Badge
                          key={c.tag}
                          variant="secondary"
                          className="text-[10px] px-2 py-0.5 bg-muted/60"
                        >
                          {c.tag} ({c.proficiency}/5)
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        General Task Specialist
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Direct PayPal Settlement Eligible
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
