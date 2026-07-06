import { useListLeads, useGetLeadsStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, DownloadCloud, Plus } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export default function Leads() {
  const [search, setSearch] = useState("");
  const { data: leads, isLoading } = useListLeads({ search });
  const { data: stats } = useGetLeadsStats();

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'converted': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'qualified': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'new': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'contacted': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground">Manage and track your potential customers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <DownloadCloud className="w-4 h-4 mr-2" />
            Scrape Leads
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Lead
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{stats?.totalLeads || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-500">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{stats?.newLeads || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-500">Qualified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{stats?.qualifiedLeads || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-500">Converted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{stats?.convertedLeads || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input 
            placeholder="Search leads by name, email, or company..." 
            className="pl-9 max-w-sm" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading leads...</TableCell>
              </TableRow>
            ) : leads?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">No leads found.</TableCell>
              </TableRow>
            ) : (
              leads?.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer">
                  <TableCell>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-xs text-muted-foreground">{lead.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{lead.company || '-'}</div>
                    <div className="text-xs text-muted-foreground">{lead.industry}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(lead.status)}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{lead.source || 'Manual'}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}