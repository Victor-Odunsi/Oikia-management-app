import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, MapPin, Trash2, Edit, Building2, Lock, Layers, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { Branch, Cluster, ClusterWithCells, UserWithRole } from "@shared/schema";

const branchFormSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
});

const clusterFormSchema = z.object({
  name: z.string().min(1, "Cluster name is required"),
  leader: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchFormSchema>;
type ClusterFormData = z.infer<typeof clusterFormSchema>;

export default function Branches() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, hasAdminAccess } = useAuth();

  // Branch dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Cluster dialog state
  const [showClustersDialog, setShowClustersDialog] = useState(false);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [showClusterFormDialog, setShowClusterFormDialog] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [showDeleteClusterDialog, setShowDeleteClusterDialog] = useState(false);
  const [clusterToDelete, setClusterToDelete] = useState<Cluster | null>(null);

  const { data: branches, isLoading } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: isAuthenticated,
  });

  const { data: allClusters } = useQuery<ClusterWithCells[]>({
    queryKey: ["/api/clusters"],
    enabled: isAuthenticated,
  });

  const { data: branchClusters, isLoading: clustersLoading } = useQuery<ClusterWithCells[]>({
    queryKey: ["/api/clusters", activeBranch?.id],
    queryFn: async () => {
      if (!activeBranch) return [];
      const res = await fetch(`/api/clusters?branchId=${activeBranch.id}`);
      if (!res.ok) throw new Error("Failed to fetch clusters");
      return res.json();
    },
    enabled: !!activeBranch && showClustersDialog,
    staleTime: 0,
  });

  const { data: usersData } = useQuery<UserWithRole[]>({
    queryKey: ["/api/users"],
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
              You need to be signed in to access branch management.
            </p>
            <Button asChild data-testid="button-login-branches">
              <a href="/">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Branch form
  const form = useForm<BranchFormData>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: { name: "", address: "", city: "", description: "" },
  });

  // Cluster form
  const clusterForm = useForm<ClusterFormData>({
    resolver: zodResolver(clusterFormSchema),
    defaultValues: { name: "", leader: "" },
  });

  // Branch mutations
  const createMutation = useMutation({
    mutationFn: async (data: BranchFormData) => apiRequest("POST", "/api/branches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      toast({ title: "Branch created successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create branch", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: BranchFormData) =>
      apiRequest("PATCH", `/api/branches/${selectedBranch?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      toast({ title: "Branch updated successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update branch", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/branches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      toast({ title: "Branch deleted successfully" });
      setShowDeleteDialog(false);
      setSelectedBranch(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete branch", description: error.message, variant: "destructive" });
    },
  });

  // Cluster mutations
  const createClusterMutation = useMutation({
    mutationFn: async (data: ClusterFormData) =>
      apiRequest("POST", "/api/clusters", { ...data, branchId: activeBranch?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clusters", activeBranch?.id] });
      toast({ title: "Cluster created successfully" });
      handleCloseClusterForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create cluster", description: error.message, variant: "destructive" });
    },
  });

  const updateClusterMutation = useMutation({
    mutationFn: async (data: ClusterFormData) =>
      apiRequest("PATCH", `/api/clusters/${editingCluster?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clusters", activeBranch?.id] });
      toast({ title: "Cluster updated successfully" });
      handleCloseClusterForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update cluster", description: error.message, variant: "destructive" });
    },
  });

  const deleteClusterMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/clusters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clusters", activeBranch?.id] });
      toast({ title: "Cluster deleted successfully" });
      setShowDeleteClusterDialog(false);
      setClusterToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete cluster", description: error.message, variant: "destructive" });
    },
  });

  // Branch handlers
  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedBranch(null);
    form.reset({ name: "", address: "", city: "", description: "" });
  };

  const handleEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    form.reset({
      name: branch.name,
      address: branch.address || "",
      city: branch.city || "",
      description: branch.description || "",
    });
    setShowDialog(true);
  };

  const handleDelete = (branch: Branch) => {
    setSelectedBranch(branch);
    setShowDeleteDialog(true);
  };

  const handleSubmit = (data: BranchFormData) => {
    if (selectedBranch) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  // Cluster handlers
  const handleOpenClusters = (branch: Branch) => {
    setActiveBranch(branch);
    setShowClustersDialog(true);
  };

  const handleCloseClusterForm = () => {
    setShowClusterFormDialog(false);
    setEditingCluster(null);
    clusterForm.reset({ name: "", leader: "" });
  };

  const handleAddCluster = () => {
    setEditingCluster(null);
    clusterForm.reset({ name: "", leader: "" });
    setShowClusterFormDialog(true);
  };

  const handleEditCluster = (cluster: Cluster) => {
    setEditingCluster(cluster);
    clusterForm.reset({ name: cluster.name, leader: cluster.leader || "" });
    setShowClusterFormDialog(true);
  };

  const handleDeleteCluster = (cluster: Cluster) => {
    setClusterToDelete(cluster);
    setShowDeleteClusterDialog(true);
  };

  const handleClusterSubmit = (data: ClusterFormData) => {
    if (editingCluster) {
      updateClusterMutation.mutate(data);
    } else {
      createClusterMutation.mutate(data);
    }
  };

  const getClusterCount = (branchId: string) =>
    allClusters?.filter((c) => c.branchId === branchId).length ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Branch Management</h1>
          <p className="text-muted-foreground">Manage your church branches and locations</p>
        </div>
        {hasAdminAccess && (
          <Button onClick={() => setShowDialog(true)} data-testid="button-add-branch">
            <Plus className="w-4 h-4 mr-2" />
            Add Branch
          </Button>
        )}
      </div>

      {branches?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No branches yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Get started by adding your first church branch
            </p>
            {hasAdminAccess && (
              <Button onClick={() => setShowDialog(true)} data-testid="button-add-first-branch">
                <Plus className="w-4 h-4 mr-2" />
                Add First Branch
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches?.map((branch) => (
            <Card key={branch.id} data-testid={`card-branch-${branch.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-lg">{branch.name}</CardTitle>
                </div>
                {hasAdminAccess && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(branch)}
                      data-testid={`button-edit-branch-${branch.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(branch)}
                      data-testid={`button-delete-branch-${branch.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {branch.city && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{branch.city}</span>
                  </div>
                )}
                {branch.address && (
                  <p className="text-sm text-muted-foreground">{branch.address}</p>
                )}
                {branch.description && (
                  <p className="text-sm">{branch.description}</p>
                )}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenClusters(branch)}
                    data-testid={`button-clusters-${branch.id}`}
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Clusters ({getClusterCount(branch.id)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Branch add/edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedBranch ? "Edit Branch" : "Add New Branch"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Lekki Branch" {...field} data-testid="input-branch-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Lagos" {...field} data-testid="input-branch-city" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Full address" {...field} data-testid="input-branch-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief description of the branch"
                        {...field}
                        data-testid="input-branch-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-branch"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : selectedBranch ? "Update Branch" : "Create Branch"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Branch delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedBranch?.name}"? This action cannot be undone.
              All users assigned to this branch will lose their branch assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBranch && deleteMutation.mutate(selectedBranch.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-branch"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clusters management dialog */}
      <Dialog open={showClustersDialog} onOpenChange={setShowClustersDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Clusters — {activeBranch?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {clustersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : branchClusters?.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                No clusters yet. Add your first cluster below.
              </p>
            ) : (
              branchClusters?.map((cluster) => (
                <div
                  key={cluster.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`cluster-row-${cluster.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{cluster.name}</p>
                    {cluster.leader && (
                      <p className="text-sm text-muted-foreground">Leader: {cluster.leader}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <Users className="w-3 h-3 mr-1" />
                      {cluster.cellCount} {cluster.cellCount === 1 ? "cell" : "cells"}
                    </Badge>
                    {hasAdminAccess && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCluster(cluster)}
                          data-testid={`button-edit-cluster-${cluster.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCluster(cluster)}
                          data-testid={`button-delete-cluster-${cluster.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="justify-between sm:justify-between">
            {hasAdminAccess && (
              <Button onClick={handleAddCluster} data-testid="button-add-cluster">
                <Plus className="w-4 h-4 mr-2" />
                Add Cluster
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowClustersDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cluster add/edit dialog */}
      <Dialog open={showClusterFormDialog} onOpenChange={setShowClusterFormDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCluster ? "Edit Cluster" : "Add New Cluster"}</DialogTitle>
          </DialogHeader>
          <Form {...clusterForm}>
            <form onSubmit={clusterForm.handleSubmit(handleClusterSubmit)} className="space-y-4">
              <FormField
                control={clusterForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cluster Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Cluster A" {...field} data-testid="input-cluster-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clusterForm.control}
                name="leader"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cluster Leader (Optional)</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)} value={field.value || "__none__"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-cluster-leader">
                          <SelectValue placeholder="Select a leader" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No leader</SelectItem>
                        {usersData?.map((user) => {
                          const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
                          return (
                            <SelectItem key={user.id} value={fullName}>
                              {fullName}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseClusterForm}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createClusterMutation.isPending || updateClusterMutation.isPending}
                  data-testid="button-submit-cluster"
                >
                  {createClusterMutation.isPending || updateClusterMutation.isPending
                    ? "Saving..."
                    : editingCluster ? "Update Cluster" : "Create Cluster"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Cluster delete confirm dialog */}
      <AlertDialog open={showDeleteClusterDialog} onOpenChange={setShowDeleteClusterDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cluster</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{clusterToDelete?.name}"? This cannot be undone.
              You must move or delete all cells in this cluster first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clusterToDelete && deleteClusterMutation.mutate(clusterToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-cluster"
            >
              {deleteClusterMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
