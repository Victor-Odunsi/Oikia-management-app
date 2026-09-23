import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertMemberSchema, type InsertMember, type MemberWithAttendanceStats, type Cell, type Branch, type Cluster } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MemberDialogProps {
  member: MemberWithAttendanceStats | null;
  open: boolean;
  onClose: () => void;
}

export function MemberDialog({ member, open, onClose }: MemberDialogProps) {
  const { toast } = useToast();
  const isEdit = !!member;

  const { data: cells } = useQuery<Cell[]>({
    queryKey: ["/api/cells"],
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
  });

  const form = useForm<InsertMember>({
    resolver: zodResolver(insertMemberSchema),
    defaultValues: member
      ? {
          firstName: member.firstName,
          lastName: member.lastName,
          gender: member.gender as "Male" | "Female",
          mobilePhone: member.mobilePhone,
          email: member.email || "",
          address: member.address || "",
          occupation: member.occupation as any,
          joinDate: member.joinDate,
          cluster: member.cluster,
          followUpWorker: member.followUpWorker || "",
          cell: member.cell || "",
          status: member.status as any,
          dateOfBirth: member.dateOfBirth || "",
          followUpType: member.followUpType as any,
          archive: member.archive as any,
          summaryNotes: member.summaryNotes || "",
          branchId: member.branchId ?? "",
        }
      : {
          firstName: "",
          lastName: "",
          gender: "Male",
          mobilePhone: "",
          email: "",
          address: "",
          occupation: "Workers",
          joinDate: new Date().toISOString().split("T")[0],
          cluster: "",
          followUpWorker: "",
          cell: "",
          status: "Crowd",
          dateOfBirth: "",
          followUpType: "General",
          archive: undefined,
          summaryNotes: "",
          branchId: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertMember) => {
      if (isEdit) {
        return await apiRequest("PATCH", `/api/members/${member.id}`, data);
      } else {
        return await apiRequest("POST", "/api/members", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({
        title: "Success",
        description: `Member ${isEdit ? "updated" : "created"} successfully`,
      });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to ${isEdit ? "update" : "create"} member`,
        variant: "destructive",
      });
    },
  });

  const selectedBranchId = useWatch({ control: form.control, name: "branchId" });

  const { data: clusters } = useQuery<Cluster[]>({
    queryKey: ["/api/clusters", selectedBranchId],
    queryFn: async () => {
      const url = selectedBranchId
        ? `/api/clusters?branchId=${selectedBranchId}`
        : "/api/clusters";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBranchId,
  });

  const { data: followUpWorkerOptions } = useQuery<MemberWithAttendanceStats[]>({
    queryKey: ["/api/members", "follow-up-workers"],
    queryFn: async () => {
      const res = await fetch("/api/members?statuses=Volunteer,Worker,Leader&limit=200", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const result = await res.json();
      return result.data ?? result;
    },
  });

  const onSubmit = (data: InsertMember) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Member" : "Add New Member"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-first-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-last-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-gender">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-dob" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="mobilePhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Phone *</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="occupation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Occupation *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-occupation">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Students">Students</SelectItem>
                        <SelectItem value="Workers">Workers</SelectItem>
                        <SelectItem value="Unemployed">Unemployed</SelectItem>
                        <SelectItem value="Self-Employed">Self-Employed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="joinDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Join Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-join-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cluster"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cluster *</FormLabel>
                    <FormControl>
                      {/* members.cluster is free text (no FK to the clusters
                          table — CSV import already accepts any non-blank
                          value), so this must allow typing a new name, not
                          just picking from existing cluster records. The
                          datalist still surfaces existing names for reuse. */}
                      <Input
                        {...field}
                        list="cluster-suggestions"
                        placeholder={selectedBranchId ? "Enter or select a cluster" : "Select a branch first"}
                        disabled={!selectedBranchId}
                        data-testid="input-cluster"
                      />
                    </FormControl>
                    <datalist id="cluster-suggestions">
                      {clusters?.map((cluster) => (
                        <option key={cluster.id} value={cluster.name} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cell"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cell</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-cell">
                          <SelectValue placeholder="Select cell (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Cell</SelectItem>
                        {cells?.filter((cell) => cell.name).map((cell) => (
                          <SelectItem key={cell.id} value={cell.name}>
                            {cell.name} ({cell.clusterName ?? cell.clusterId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Crowd">Crowd</SelectItem>
                        <SelectItem value="Potential">Potential</SelectItem>
                        <SelectItem value="Committed">Committed</SelectItem>
                        <SelectItem value="Volunteer">Volunteer</SelectItem>
                        <SelectItem value="Worker">Worker</SelectItem>
                        <SelectItem value="Leader">Leader</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="followUpWorker"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Follow Up Worker</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-follow-up-worker">
                          <SelectValue placeholder="Select worker (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {followUpWorkerOptions?.map((m) => {
                          const fullName = `${m.firstName} ${m.lastName}`;
                          return (
                            <SelectItem key={m.id} value={fullName}>
                              {fullName} ({m.status})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="followUpType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Follow Up Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-follow-up-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Adhoc">Adhoc</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="archive"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Archive Status</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-archive">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Relocated">Relocated</SelectItem>
                        <SelectItem value="Has a church">Has a church</SelectItem>
                        <SelectItem value="Wrong number">Wrong number</SelectItem>
                        <SelectItem value="Unreachable">Unreachable</SelectItem>
                        <SelectItem value="Not interested">Not interested</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="summaryNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} data-testid="textarea-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
                {mutation.isPending ? "Saving..." : isEdit ? "Update Member" : "Add Member"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
