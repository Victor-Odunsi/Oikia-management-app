import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, LogIn, CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { Branch } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";


const signinFormSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

type SigninFormData = z.infer<typeof signinFormSchema>;

const signupFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.enum(["Male", "Female"], { required_error: "Gender is required" }),
  address: z.string().min(1, "Address is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  email: z.string().email("Valid email is required"),
  branchId: z.string().min(1, "Branch is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupFormSchema>;

function SigninForm() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SigninFormData>({
    resolver: zodResolver(signinFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const signinMutation = useMutation({
    mutationFn: async (data: SigninFormData) => {
      const response = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Sign in failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Sign In Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => signinMutation.mutate(d))} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} className="h-10" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...field}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <a
            href="/forgot-password"
            className="text-xs hover:underline"
            style={{ color: "#F7821B" }}
          >
            Forgot password?
          </a>
        </div>
        <Button
          type="submit"
          className="w-full h-11 font-semibold text-white mt-2"
          style={{ backgroundColor: "#F7821B", border: "none" }}
          disabled={signinMutation.isPending}
        >
          {signinMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing In...
            </>
          ) : (
            <>
              <LogIn className="w-5 h-5 mr-2" />
              Sign In
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}

function SignupForm() {
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: branches = [], isLoading: isBranchesLoading, isError: isBranchesError } =
    useQuery<Branch[]>({ queryKey: ["/api/public/branches"] });

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      gender: undefined,
      address: "",
      phoneNumber: "",
      email: "",
      branchId: "",
      password: "",
      confirmPassword: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const { confirmPassword: _, ...payload } = data;
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }
      return response.json();
    },
    onSuccess: () => {
      setIsSuccess(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#F7821B20" }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: "#F7821B" }} />
        </div>
        <h3 className="text-xl font-bold" style={{ color: "#1C0F0A" }}>
          Registration Submitted
        </h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Your account has been created. You already have branch representative access — sign in
          to get started.
        </p>
        <a
          href="/"
          className="mt-2 text-sm font-semibold hover:underline"
          style={{ color: "#F7821B" }}
        >
          ← Back to Sign In
        </a>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => signupMutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-gray-600">First Name</FormLabel>
                <FormControl>
                  <Input placeholder="John" {...field} className="h-10" />
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
                <FormLabel className="text-xs font-medium text-gray-600">Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} className="h-10" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Gender</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select gender" />
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="john.doe@example.com" {...field} className="h-10" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Phone Number</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="+234 xxx xxx xxxx" {...field} className="h-10" />
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
              <FormLabel className="text-xs font-medium text-gray-600">Address</FormLabel>
              <FormControl>
                <Input placeholder="Your home address" {...field} className="h-10" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Branch</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isBranchesLoading || isBranchesError}
              >
                <FormControl>
                  <SelectTrigger className="h-10">
                    <SelectValue
                      placeholder={
                        isBranchesLoading
                          ? "Loading branches..."
                          : isBranchesError
                            ? "Failed to load"
                            : branches.length === 0
                              ? "No branches available"
                              : "Select your branch"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {branches.map((branch) => (
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
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    {...field}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-gray-600">Confirm Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter password"
                    {...field}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full h-11 font-semibold text-white mt-2"
          style={{ backgroundColor: "#F7821B", border: "none" }}
          disabled={
            signupMutation.isPending ||
            isBranchesLoading ||
            isBranchesError ||
            branches.length === 0
          }
        >
          {signupMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Account...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}

export default function AuthPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden font-[Arial,sans-serif]">
      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex items-center justify-center w-[42%] shrink-0"
        style={{ backgroundColor: "#000000" }}
      >
        <img
          src="/large_black_logo.png"
          alt="Oikia Christian Centre"
          className="w-4/5"
        />
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center overflow-y-auto p-6"
        style={{ backgroundColor: "#FDFAF7" }}
      >
        {/* Mobile-only logo */}
        <div className="flex lg:hidden justify-center mb-8">
          <img
            src="/large_black_logo.png"
            alt="Oikia Christian Centre"
            className="w-40"
            style={{ filter: "invert(1)" }}
          />
        </div>

        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold mb-1" style={{ color: "#1C0F0A" }}>
            Welcome back
          </h2>
          <p className="text-sm text-gray-500 mb-8">
            Sign in to your account or create a new one.
          </p>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="w-full mb-6 bg-gray-100 p-1 rounded-lg h-11">
              <TabsTrigger
                value="signin"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md text-sm font-medium"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md text-sm font-medium"
              >
                Create Account
              </TabsTrigger>
            </TabsList>

            {/* Sign In tab */}
            <TabsContent value="signin" className="mt-0">
              <SigninForm />
            </TabsContent>

            {/* Create Account tab */}
            <TabsContent value="signup" className="mt-0">
              <SignupForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
