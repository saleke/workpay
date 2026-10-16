import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlusCircle } from "lucide-react";

export default function TasksPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl">My Tasks</h1>
          <p className="text-sm text-muted-foreground">Tasks you created or are working on.</p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Task
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Your current work.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No tasks yet. Create your first task to get started.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
