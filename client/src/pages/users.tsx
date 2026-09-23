import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, Trash2, Edit, UserCog, Building2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { UserWithRole, Branch, UserRole, ClusterWithCells } from "@shared/schema";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin (Senior Pastor)",
  branch_admin: "Branch Admin (Resident Pastor)",
  group_admin: "Group Admin (Cluster Lead)",
  cell_leader: "Cell Leader",
  branch_rep: "Branch Representative",
};

const roleDescriptions: Record<string, string> = {
  super_admin: "Full access to all branches, users, and data",
  branch_admin: "View all data for their assigned branch",
  group_admin: "Manage cell leaders and view assigned cells",
  cell_leader: "Manage their cell and take attendance",
  branch_rep: "View and edit branch data, no role management",
};

const roleFormSchema = z.object({
  role: z.enum(["super_admin", "branch_admin", "group_admin", "cell_leader", "branch_rep"]),
  branchId: z.string().optional(),
  clusterId: z.string().optional(),
  cellId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === "super_admin") return;
  if (!data.branchId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["branchId"], message: "A branch is required for this role" });
  }
  if (data.role === "group_admin" && !data.clusterId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clusterId"], message: "Group Admin requires a cluster" });
  }
  if (data.role === "cell_leader" && !data.cellId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cellId"], message: "Cell Leader requires a cell" });
  }
});

type RoleFormData = z.infer<typeof roleFormSchema>;

export default function Users() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, hasAdminAccess, isRoleLoading } = useAuth();
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery<UserWithRole[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: isAuthenticated,
  });

  const { data: clusters } = useQuery<ClusterWithCells[]>({
    queryKey: ["/api/clusters"],
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="flex-1 p-6">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Lock className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle>Sign In Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">
              You need to be signed in to access user management.
            </p>
            <Button asChild data-testid="button-login-users">
              <a href="/">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      role: "cell_leader",
      branchId: "",
      clusterId: "",
      cellId: "",
    },
  });

  const watchedRole = form.watch("role");
  const watchedBranchId = form.watch("branchId");
  const watchedClusterId = form.watch("clusterId");

  const clustersInBranch = clusters?.filter((c) => !watchedBranchId || c.branchId === watchedBranchId) ?? [];
  const cellsInCluster = clusters?.find((c) => c.id === watchedClusterId)?.cells ?? [];

  const assignRoleMutation = useMutation({
    mutationFn: async (data: RoleFormData & { userId: string }) => {
      return apiRequest("POST", "/api/user-roles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Role assigned successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign role", description: error.message, variant: "destructive" });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      return apiRequest("DELETE", `/api/user-roles/${roleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Role removed successfully" });
      setShowRemoveDialog(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove role", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseDialog = () => {
    setShowRoleDialog(false);
    setSelectedUser(null);
    form.reset({ role: "cell_leader", branchId: "", clusterId: "", cellId: "" });
  };

  const handleEditRole = (user: UserWithRole) => {
    setSelectedUser(user);
    form.reset({
      role: (user.role?.role as RoleFormData["role"]) || "cell_leader",
      branchId: user.role?.branchId || "",
      clusterId: user.role?.clusterId || "",
      cellId: user.role?.cellId || "",
    });
    setShowRoleDialog(true);
  };

  const handleRemoveRole = (user: UserWithRole) => {
    setSelectedUser(user);
    setShowRemoveDialog(true);
  };

  const handleSubmit = (data: RoleFormData) => {
    if (!selectedUser) return;
    
    const submitData = {
      ...data,
      userId: selectedUser.id,
      branchId: data.branchId || undefined,
      clusterId: data.clusterId || undefined,
      cellId: data.cellId || undefined,
    };
    
    assignRoleMutation.mutate(submitData);
  };

  const getInitials = (user: UserWithRole) => {
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U";
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case "super_admin":
        return "default";
      case "branch_admin":
      case "group_admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (usersLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Manage user roles and permissions</p>
      </div>

      {users?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserCog className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No users yet</h3>
            <p className="text-muted-foreground text-center">
              Users will appear here once they log in to the system
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users?.map((user) => (
            <Card key={user.id} data-testid={`card-user-${user.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback>{getInitials(user)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}`
                        : user.email || "Unknown User"}
                    </CardTitle>
                    {user.email && user.firstName && (
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {user.role ? (
                  <div className="space-y-2">
                    <Badge variant={getRoleBadgeVariant(user.role.role)}>
                      {roleLabels[user.role.role] || user.role.role}
                    </Badge>
                    {user.branch && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="w-4 h-4" />
                        <span>{user.branch.name}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    No role assigned
                  </Badge>
                )}
                {hasAdminAccess && (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEditRole(user)}
                      data-testid={`button-edit-role-${user.id}`}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      {user.role ? "Edit Role" : "Assign Role"}
                    </Button>
                    {user.role && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRemoveRole(user)}
                        data-testid={`button-remove-role-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {selectedUser?.role ? "Edit User Role" : "Assign User Role"}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
              <Avatar>
                <AvatarImage src={selectedUser.profileImageUrl || undefined} />
                <AvatarFallback>{getInitials(selectedUser)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {selectedUser.firstName && selectedUser.lastName 
                    ? `${selectedUser.firstName} ${selectedUser.lastName}`
                    : selectedUser.email || "Unknown User"}
                </p>
                {selectedUser.email && selectedUser.firstName && (
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                )}
              </div>
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin (Senior Pastor)</SelectItem>
                        <SelectItem value="branch_admin">Branch Admin (Resident Pastor)</SelectItem>
                        <SelectItem value="group_admin">Group Admin (Cluster Lead)</SelectItem>
                        <SelectItem value="cell_leader">Cell Leader</SelectItem>
                        <SelectItem value="branch_rep">Branch Representative</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {roleDescriptions[watchedRole]}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {(watchedRole === "branch_admin" || watchedRole === "branch_rep" || watchedRole === "group_admin" || watchedRole === "cell_leader") && (
                <FormField
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Branch</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // a cluster/cell chosen under the previous branch may not belong to this one
                          form.setValue("clusterId", "");
                          form.setValue("cellId", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-branch">
                            <SelectValue placeholder="Select a branch" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches?.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {(watchedRole === "group_admin" || watchedRole === "cell_leader") && (
                <FormField
                  control={form.control}
                  name="clusterId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Cluster</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // a cell chosen under the previous cluster may not belong to this one
                          form.setValue("cellId", "");
                        }}
                        value={field.value}
                        disabled={!watchedBranchId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-cluster">
                            <SelectValue placeholder={watchedBranchId ? "Select a cluster" : "Select a branch first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clustersInBranch.map((cluster) => (
                            <SelectItem key={cluster.id} value={cluster.id}>
                              {cluster.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchedRole === "cell_leader" && (
                <FormField
                  control={form.control}
                  name="cellId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Cell</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!watchedClusterId}>
                        <FormControl>
                          <SelectTrigger data-testid="select-cell">
                            <SelectValue placeholder={watchedClusterId ? "Select a cell" : "Select a cluster first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {cellsInCluster.map((cell) => (
                            <SelectItem key={cell.id} value={cell.id}>
                              {cell.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={assignRoleMutation.isPending}
                  data-testid="button-submit-role"
                >
                  {assignRoleMutation.isPending 
                    ? "Saving..." 
                    : selectedUser?.role ? "Update Role" : "Assign Role"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the role from this user? 
              They will lose all permissions associated with their current role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser?.role && removeRoleMutation.mutate(selectedUser.role.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-role"
            >
              {removeRoleMutation.isPending ? "Removing..." : "Remove Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
