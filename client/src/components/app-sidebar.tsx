import { Users, UserPlus, CalendarCheck, Home, MessageSquare, ClipboardList, Network, Building2, UserCog, ShieldCheck, LogOut, Megaphone, Settings, BarChart2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    onboardingId: "nav-dashboard",
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart2,
    onboardingId: "nav-reports",
  },
  {
    title: "Members",
    url: "/members",
    icon: Users,
    onboardingId: "nav-members",
  },
  {
    title: "First Timers",
    url: "/first-timers",
    icon: UserPlus,
    onboardingId: "nav-first-timers",
  },
  {
    title: "Attendance",
    url: "/attendance",
    icon: CalendarCheck,
    onboardingId: "nav-attendance",
  },
  {
    title: "Cells",
    url: "/cells",
    icon: Network,
    onboardingId: "nav-cells",
  },
  {
    title: "Outreach",
    url: "/outreach",
    icon: Megaphone,
    onboardingId: "nav-outreach",
  },
  {
    title: "Follow-up Tasks",
    url: "/follow-up-tasks",
    icon: ClipboardList,
    onboardingId: "nav-follow-up-tasks",
  },
  {
    title: "Communications",
    url: "/communications",
    icon: MessageSquare,
    onboardingId: "nav-communications",
  },
];

const adminMenuItems = [
  {
    title: "Branches",
    url: "/branches",
    icon: Building2,
    onboardingId: "nav-branches",
    requiredPermission: "branches.manage",
  },
  {
    title: "User Management",
    url: "/users",
    icon: UserCog,
    onboardingId: "nav-users",
    requiredPermission: "users.manage",
  },
  {
    title: "Roles & Permissions",
    url: "/roles-permissions",
    icon: ShieldCheck,
    onboardingId: "nav-roles-permissions",
    requiredPermission: "roles.manage",
  },
  {
    title: "Admin Settings",
    url: "/admin-settings",
    icon: Settings,
    onboardingId: "nav-admin-settings",
    // Gated server-side by requireRole("super_admin", "branch_admin"), not by
    // the customizable permission matrix, so it's checked by role below
    // instead of requiredPermission.
    requiredPermission: null as string | null,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated, logout, isLoading, userRole, isSuperAdmin, isBranchAdmin } = useAuth();

  const { data: rolePermissions } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/role-permissions"],
    enabled: isAuthenticated,
  });

  const myPermissions = userRole?.role ? rolePermissions?.[userRole.role] ?? [] : [];
  const visibleAdminItems = adminMenuItems.filter((item) =>
    item.requiredPermission
      ? myPermissions.includes(item.requiredPermission)
      : isSuperAdmin || isBranchAdmin
  );

  const getInitials = () => {
    if (!user) return "U";
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U";
  };

  const getUserDisplayName = () => {
    if (!user) return "Guest";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "User";
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-semibold px-4 py-6">
            The Waypoint
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`} data-onboarding={item.onboardingId}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAuthenticated && visibleAdminItems.length > 0 && (
          <>
            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={location === item.url}>
                        <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`} data-onboarding={item.onboardingId}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-muted rounded animate-pulse w-24" />
              <div className="h-3 bg-muted rounded animate-pulse w-32" />
            </div>
          </div>
        ) : isAuthenticated && user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{getUserDisplayName()}</p>
                {user.email && user.firstName && (
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full" data-testid="button-login">
              <a href="/">Log In</a>
            </Button>
            <Button asChild variant="outline" className="w-full" data-testid="button-signup">
              <Link href="/signup">Sign Up</Link>
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
