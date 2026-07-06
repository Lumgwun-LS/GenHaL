import { useListVendors, useCreateVendor, getListVendorsQueryKey, useGetVendorStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Store } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function Vendors() {
  const [search, setSearch] = useState("");
  const { data: vendors, isLoading } = useListVendors({ search });
  const { data: stats } = useGetVendorStats();
  
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">Manage companies, agencies, and partners.</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalVendors || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Vendors</CardTitle>
            <Store className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeVendors || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentSignups || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input 
            placeholder="Search vendors..." 
            className="pl-9 max-w-sm" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading vendors...</TableCell>
              </TableRow>
            ) : vendors?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">No vendors found.</TableCell>
              </TableRow>
            ) : (
              vendors?.map((vendor) => (
                <TableRow key={vendor.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/vendors/${vendor.id}`} className="font-medium hover:underline">
                      {vendor.name}
                    </Link>
                  </TableCell>
                  <TableCell>{vendor.industry}</TableCell>
                  <TableCell>
                    <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>
                      {vendor.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{vendor.email}</div>
                    <div className="text-xs text-muted-foreground">{vendor.phone}</div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(vendor.createdAt).toLocaleDateString()}
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
