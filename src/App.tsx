/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
  orderBy
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { cn } from "./lib/utils";
import { 
  Building2, 
  User as UserIcon, 
  Plus, 
  Search, 
  MessageSquare, 
  TrendingUp, 
  MapPin, 
  ArrowRight,
  LogOut,
  Star,
  Shield,
  School,
  Dumbbell,
  CheckCircle2,
  Clock,
  Loader2,
  Lightbulb,
  Sparkles,
  Compass
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  generateListingInfo, 
  searchAddresses, 
  conductInterviewChunk, 
  rateCandidate,
  getPortfolioInsights
} from "./services/geminiService";
import Markdown from "react-markdown";

// Types
interface Profile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: "owner" | "applicant";
  createdAt: any;
}

interface Property {
  id: string;
  ownerId: string;
  address: string;
  listingTitle: string;
  listingDescription: string;
  suggestedPrice: number;
  actualPrice: number;
  bedrooms: number;
  bathrooms: number;
  neighborhood: {
    schools: string[];
    gyms: string[];
    safetyScore: number;
    pois: string[];
  };
  createdAt: any;
}

interface Application {
  id: string;
  propertyId: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  status: "pending" | "interviewing" | "rated" | "accepted" | "rejected";
  creditScore?: number;
  jobHistory?: string;
  rentalHistory?: string;
  interviewTranscript: { role: "user" | "model"; text: string }[];
  ownerPrompt?: string;
  aiRating?: {
    score: number;
    feedback: string;
  };
  createdAt: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"dashboard" | "add-property" | "browse" | "interview" | "property-details" | "applicants">("dashboard");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, "users", u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as Profile);
        } else {
          // New user needs role selection
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login Error:", err);
    }
  };

  const setRole = async (role: "owner" | "applicant") => {
    if (!user) return;
    const newProfile: Profile = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "Anonymous",
      photoURL: user.photoURL || "",
      role,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "users", user.uid), newProfile);
      setProfile(newProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F5F5F5]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return <AuthView onLogin={handleLogin} />;
  }

  if (!profile) {
    return <RoleSelection onSelect={setRole} />;
  }

  return (
    <div className="min-h-screen bg-natural-bg font-sans text-natural-text">
      <Navbar profile={profile} onSignOut={() => signOut(auth)} setView={setView} view={view} />
      
      <main className="mx-auto max-w-7xl px-4 py-8">
        <AnimatePresence mode="wait">
          {view === "applicants" && profile.role === "owner" && (
            <motion.div
              key="applicants"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ApplicantsDashboard 
                profile={profile} 
                onViewReport={(app, prop) => {
                  setSelectedApplication(app);
                  setSelectedProperty(prop);
                  setView("interview");
                }}
              />
            </motion.div>
          )}

          {view === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {profile.role === "owner" ? (
                <OwnerDashboard 
                  profile={profile} 
                  onAddProperty={() => setView("add-property")} 
                  onViewApplications={(app, prop) => {
                    setSelectedApplication(app);
                    setSelectedProperty(prop);
                    setView("interview");
                  }}
                  onViewProperty={(p) => {
                    setSelectedProperty(p);
                    setView("property-details");
                  }}
                />
              ) : (
                <ApplicantDashboard 
                  profile={profile} 
                  onBrowse={() => setView("browse")} 
                  onContinueInterview={(app, prop) => {
                    setSelectedApplication(app);
                    setSelectedProperty(prop);
                    setView("interview");
                  }}
                />
              )}
            </motion.div>
          )}

          {view === "add-property" && (
            <motion.div
              key="add-property"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <PropertyForm 
                onCancel={() => setView("dashboard")} 
                onSuccess={() => setView("dashboard")}
                ownerId={profile.uid}
              />
            </motion.div>
          )}

          {view === "browse" && (
            <motion.div
              key="browse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <BrowseListings 
                onSelect={(prop) => {
                  setSelectedProperty(prop);
                  setView("property-details");
                }}
              />
            </motion.div>
          )}

          {view === "property-details" && selectedProperty && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <PropertyDetails 
                property={selectedProperty} 
                profile={profile}
                onBack={() => setView("browse")}
                onApply={async () => {
                   const appData: Partial<Application> = {
                     propertyId: selectedProperty.id,
                     applicantId: profile.uid,
                     applicantName: profile.displayName,
                     applicantEmail: profile.email,
                     status: "pending",
                     interviewTranscript: [{ role: "model", text: "Hello! Thank you for your interest in my property. I'd love to chat and get to know you a bit better before we move forward. Shall we begin?" }],
                     createdAt: serverTimestamp(),
                   };
                   try {
                     const ref = await addDoc(collection(db, "applications"), appData);
                     setSelectedApplication({ ...appData, id: ref.id } as Application);
                     setView("interview");
                   } catch (err) {
                     handleFirestoreError(err, OperationType.CREATE, "applications");
                   }
                }}
              />
            </motion.div>
          )}

          {view === "interview" && selectedApplication && (
             <motion.div
              key="interview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
             >
               <InterviewAgent 
                 application={selectedApplication} 
                 property={selectedProperty} 
                 profile={profile}
                 onBack={() => setView("dashboard")}
               />
             </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Views ---

function AuthView({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex h-screen w-full bg-natural-bg">
      <div className="hidden w-1/2 bg-natural-primary lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div className="text-2xl font-serif font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="h-8 w-8 text-natural-secondary" />
            Haven
          </div>
          <div>
            <h1 className="text-6xl font-serif leading-tight text-white">
              The future of <br />
              <span className="text-natural-secondary">rental management</span> <br />
              is here.
            </h1>
          </div>
          <div className="text-sm text-white/60">
            © 2026 Haven. All residential data protected.
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-1/2">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-3xl font-serif font-bold text-natural-primary">Welcome back</h2>
          <p className="mb-8 text-natural-accent">Simplify your rental journey with AI-driven insights and automated applicant vetting.</p>
          <button 
            onClick={onLogin}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-natural-secondary bg-white px-6 py-3 font-medium text-natural-text transition-shadow hover:shadow-md"
          >
            <img src="https://www.google.com/favicon.ico" className="h-5 w-5" alt="Google" referrerPolicy="no-referrer" />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleSelection({ onSelect }: { onSelect: (role: "owner" | "applicant") => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-natural-bg p-4 text-center">
      <h2 className="mb-2 text-4xl font-serif font-bold text-natural-primary">Choose your path</h2>
      <p className="mb-10 text-natural-accent max-w-sm">Are you looking to manage your estate or find your next home?</p>
      
      <div className="grid gap-8 sm:grid-cols-2 max-w-2xl w-full">
        <button 
          onClick={() => onSelect("owner")}
          className="group flex flex-col items-center rounded-[20px] bg-natural-card p-10 transition-all shadow-natural hover:-translate-y-1"
        >
          <div className="mb-6 rounded-2xl bg-natural-secondary p-4 text-natural-primary group-hover:bg-natural-primary group-hover:text-white transition-colors">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-serif font-bold text-natural-primary">I'm a Homeowner</h3>
          <p className="text-sm text-natural-accent">List your property, get AI pricing, and let our agent interview tenants.</p>
        </button>
        
        <button 
          onClick={() => onSelect("applicant")}
          className="group flex flex-col items-center rounded-[20px] bg-natural-card p-10 transition-all shadow-natural hover:-translate-y-1"
        >
          <div className="mb-6 rounded-2xl bg-natural-secondary p-4 text-natural-primary group-hover:bg-natural-primary group-hover:text-white transition-colors">
            <UserIcon className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-serif font-bold text-natural-primary">I'm a Renter</h3>
          <p className="text-sm text-natural-accent">Find beautiful properties and interview with the homeowner to secure your spot.</p>
        </button>
      </div>
    </div>
  );
}

function Navbar({ profile, onSignOut, setView, view }: { profile: Profile, onSignOut: () => void, setView: (v: any) => void, view: string }) {
  return (
    <nav className="border-b border-black/5 bg-natural-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6">
        <div 
          className="flex cursor-pointer items-center gap-2 text-2xl font-serif font-bold tracking-tight text-natural-primary"
          onClick={() => setView("dashboard")}
        >
          <Building2 className="h-6 w-6" />
          Haven
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-8 md:flex">
            <button onClick={() => setView("dashboard")} className={cn("text-sm font-medium transition-colors", view === "dashboard" ? "text-natural-primary font-bold underline underline-offset-8 decoration-2" : "text-natural-accent hover:text-natural-primary")}>Dashboard</button>
            {profile.role === "owner" && (
              <button onClick={() => setView("applicants")} className={cn("text-sm font-medium transition-colors", view === "applicants" ? "text-natural-primary font-bold underline underline-offset-8 decoration-2" : "text-natural-accent hover:text-natural-primary")}>Applicants</button>
            )}
            {profile.role === "applicant" && (
              <button onClick={() => setView("browse")} className={cn("text-sm font-medium transition-colors", view === "browse" ? "text-natural-primary font-bold underline underline-offset-8 decoration-2" : "text-natural-accent hover:text-natural-primary")}>Marketplace</button>
            )}
          </div>
          
          <div className="h-6 w-px bg-natural-secondary" />
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-natural-text">{profile.displayName}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-natural-accent">{profile.role}</div>
            </div>
            <img src={profile.photoURL} className="h-9 w-9 rounded-full border border-natural-secondary" alt="Avatar" referrerPolicy="no-referrer" />
            <button 
              onClick={onSignOut}
              className="rounded-full p-2 text-natural-accent hover:bg-natural-secondary hover:text-natural-primary transition-colors"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// --- Components ---

function PortfolioInsights({ properties }: { properties: Property[] }) {
  const [insights, setInsights] = useState<{ title: string, context: string, valueIncrease: string, difficulty: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (properties.length === 0) return;
    const loadInsights = async () => {
      try {
        const data = await getPortfolioInsights(properties);
        setInsights(data);
      } catch (err) {
        console.error("Failed to load insights", err);
      } finally {
        setLoading(false);
      }
    };
    loadInsights();
  }, [properties]);

  if (loading) return (
    <div className="rounded-[40px] bg-natural-secondary/10 p-12 border border-dashed border-natural-accent/20 flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 text-natural-accent animate-spin" />
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-natural-accent">Analyzing Market Trends...</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-serif font-bold text-natural-primary">Strategic Upgrades</h3>
          <p className="text-sm text-natural-accent">AI suggested improvements based on neighborhood benchmarks.</p>
        </div>
        <div className="px-5 py-2 rounded-full bg-natural-secondary text-natural-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
           <Sparkles className="h-3.5 w-3.5" />
           Market Alpha
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group rounded-[32px] bg-natural-card p-8 border border-black/5 hover:border-natural-primary/20 transition-all shadow-natural flex flex-col"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="h-12 w-12 rounded-2xl bg-natural-secondary/30 flex items-center justify-center text-natural-primary group-hover:scale-110 transition-transform">
                <Lightbulb className="h-6 w-6" />
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                insight.difficulty === "Low" ? "bg-green-100 text-green-700" :
                insight.difficulty === "Medium" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              )}>
                {insight.difficulty} Effort
              </div>
            </div>

            <h4 className="text-lg font-serif font-bold text-natural-primary mb-3 leading-tight underline decoration-natural-secondary decoration-2 underline-offset-4">{insight.title}</h4>
            <p className="text-sm text-natural-accent leading-relaxed italic mb-6">"{insight.context}"</p>
            
            <div className="mt-auto pt-6 border-t border-natural-secondary/50 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-natural-accent">Impact Est.</span>
              <span className="text-xl font-serif font-bold text-natural-primary">{insight.valueIncrease}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function OwnerDashboard({ profile, onAddProperty, onViewApplications, onViewProperty }: { profile: Profile, onAddProperty: () => void, onViewApplications: (app: Application, prop: Property) => void, onViewProperty: (p: Property) => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "properties"), where("ownerId", "==", profile.uid));
    return onSnapshot(q, (snapshot) => {
      setProperties(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Property)));
      setLoading(false);
    });
  }, [profile.uid]);

  useEffect(() => {
    if (properties.length === 0) return;
    const q = query(collection(db, "applications"), where("propertyId", "in", properties.map(p => p.id)), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setApplications(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application)));
    });
  }, [properties]);

  if (loading) return <div className="p-8 text-center text-natural-accent font-serif">Loading portfolio...</div>;

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold tracking-tight text-natural-primary">Your Portfolio</h2>
          <p className="text-natural-accent">Manage your properties and review applicant ratings.</p>
        </div>
        <button 
          onClick={onAddProperty}
          className="flex items-center gap-2 rounded-full bg-natural-primary px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 w-full sm:w-auto justify-center shadow-natural"
        >
          <Plus className="h-4 w-4" />
          Add Property
        </button>
      </header>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] bg-natural-card p-20 text-center shadow-natural">
          <div className="mb-4 rounded-[20px] bg-natural-secondary p-6 text-natural-primary">
            <Building2 className="h-10 w-10" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-natural-primary">No properties yet</h3>
          <p className="mb-6 text-natural-accent">Get started by listing your first rental property.</p>
          <button onClick={onAddProperty} className="text-natural-primary font-bold hover:underline">List a property now →</button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {properties.map(prop => (
            <div 
              key={prop.id} 
              onClick={() => onViewProperty(prop)}
              className="group cursor-pointer rounded-[20px] bg-natural-card p-6 shadow-natural transition-all hover:scale-[1.02] border border-black/5">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-lg bg-natural-secondary px-3 py-1 text-[11px] font-bold text-natural-primary uppercase tracking-widest">Active</div>
                <div className="text-xl font-serif font-bold text-natural-primary">${prop.actualPrice}/mo</div>
              </div>
              <h4 className="mb-2 text-lg font-serif font-bold text-natural-primary truncate">{prop.listingTitle}</h4>
              <div className="mb-6 flex items-center gap-2 text-sm text-natural-accent">
                <MapPin className="h-4 w-4" />
                {prop.address}
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-t border-natural-secondary pt-6">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-natural-accent">Applicants</div>
                  <div className="text-lg font-bold text-natural-text">{applications.filter(a => a.propertyId === prop.id).length}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-natural-accent">Avg. Rating</div>
                  <div className="text-lg font-bold text-natural-primary">
                    {(() => {
                      const propApps = applications.filter(a => a.propertyId === prop.id && a.aiRating);
                      if (propApps.length === 0) return "N/A";
                      return Math.round(propApps.reduce((acc, a) => acc + (a.aiRating?.score || 0), 0) / propApps.length) + "%";
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {applications.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-2xl font-serif font-bold text-natural-primary">Recent Activity</h3>
          <div className="rounded-[20px] bg-natural-card shadow-natural border border-black/5 overflow-hidden">
            <div className="p-8 flex items-center justify-between border-b border-natural-secondary bg-natural-bg/10">
               <div>
                  <h4 className="font-serif font-bold text-natural-primary uppercase tracking-widest text-[11px]">Recent Submissions</h4>
               </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-natural-secondary/20">
                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-natural-accent">Applicant</th>
                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-natural-accent text-center">AI Verdict</th>
                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-natural-accent text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-secondary">
                  {applications.slice(0, 5).map(app => (
                    <tr key={app.id} className="hover:bg-natural-bg/30 transition-colors">
                      <td className="px-8 py-5">
                        <div className="font-semibold text-natural-text">{app.applicantName}</div>
                        <div className="text-[11px] text-natural-accent">{app.applicantEmail}</div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        {app.aiRating ? (
                          <div className="font-serif font-bold text-xl text-natural-primary">{app.aiRating.score}%</div>
                        ) : (
                          <div className="text-[9px] font-bold uppercase tracking-widest text-natural-accent animate-pulse">In Review...</div>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => {
                            const prop = properties.find(p => p.id === app.propertyId);
                            if (prop) onViewApplications(app, prop);
                          }}
                          className="text-[10px] font-bold uppercase tracking-widest text-natural-primary hover:underline underline-offset-4"
                        >
                          {app.status === "rated" ? "View Dossier" : "Review & Evaluate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {properties.length > 0 && (
        <PortfolioInsights properties={properties} />
      )}
    </div>
  );
}

function ApplicantsDashboard({ profile, onViewReport }: { profile: Profile, onViewReport: (app: Application, prop: Property) => void }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [properties, setProperties] = useState<Record<string, Property>>({});
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState("");

  useEffect(() => {
    const propsQuery = query(collection(db, "properties"), where("ownerId", "==", profile.uid));
    return onSnapshot(propsQuery, (propSnap) => {
      const propMap: Record<string, Property> = {};
      propSnap.docs.forEach(doc => {
        const p = { ...doc.data(), id: doc.id } as Property;
        propMap[p.id] = p;
      });
      setProperties(propMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "properties"));
  }, [profile.uid]);

  useEffect(() => {
    const propIds = Object.keys(properties);
    if (propIds.length === 0) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const appQuery = query(collection(db, "applications"), where("propertyId", "in", propIds), orderBy("createdAt", "desc"));
    return onSnapshot(appQuery, (appSnap) => {
      setApplications(appSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "applications"));
  }, [properties]);

  const savePrompt = async (appId: string) => {
    try {
      await updateDoc(doc(db, "applications", appId), { ownerPrompt: promptInput });
      setEditingPrompt(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `applications/${appId}`);
    }
  };

  if (loading) return <div className="p-20 text-center text-natural-accent font-serif text-sm uppercase tracking-widest animate-pulse">Synchronizing applicant global index...</div>;

  return (
    <div className="space-y-12 pb-20">
      <header>
        <h2 className="text-4xl font-serif font-bold tracking-tight text-natural-primary">Applicant Oversight</h2>
        <p className="text-natural-accent text-lg">Detailed dossier of all candidates currently engaged in the selection process.</p>
      </header>

      <div className="rounded-[32px] bg-natural-card shadow-natural border border-black/5 overflow-hidden">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="bg-natural-secondary/10">
              <th className="px-10 py-8 text-[11px] font-bold uppercase tracking-widest text-natural-accent">Candidate Dossier</th>
              <th className="px-10 py-8 text-[11px] font-bold uppercase tracking-widest text-natural-accent">Assigned Asset</th>
              <th className="px-10 py-8 text-[11px] font-bold uppercase tracking-widest text-natural-accent text-center">Agency Status</th>
              <th className="px-10 py-8 text-[11px] font-bold uppercase tracking-widest text-natural-accent text-center">AI Rating</th>
              <th className="px-10 py-8 text-[11px] font-bold uppercase tracking-widest text-natural-accent text-right">Intervention</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-natural-secondary/50">
            {applications.map(app => (
              <tr key={app.id} className="hover:bg-natural-bg/20 transition-all duration-300 group">
                <td className="px-10 py-8">
                  <div className="font-serif font-bold text-lg text-natural-primary">{app.applicantName}</div>
                  <div className="text-xs text-natural-accent font-medium mt-0.5 tracking-tight">{app.applicantEmail}</div>
                </td>
                <td className="px-10 py-8">
                  <div className="text-sm font-medium text-natural-primary truncate max-w-[200px]">{properties[app.propertyId]?.listingTitle}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mt-1">{properties[app.propertyId]?.address}</div>
                </td>
                <td className="px-10 py-8 text-center">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest shadow-sm",
                    app.status === "rated" ? "bg-natural-primary text-white" : "bg-natural-secondary text-natural-primary"
                  )}>
                    {app.status}
                  </span>
                </td>
                <td className="px-10 py-8 text-center">
                  {app.aiRating ? (
                    <div className="font-serif font-bold text-3xl text-natural-primary tracking-tighter">{app.aiRating.score}%</div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <div className="h-1.5 w-16 bg-natural-secondary rounded-full overflow-hidden">
                        <motion.div 
                          animate={{ x: [-64, 64] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="h-full w-1/2 bg-natural-primary"
                        />
                      </div>
                      <span className="text-[9px] font-bold text-natural-accent uppercase">Evaluating</span>
                    </div>
                  )}
                </td>
                <td className="px-10 py-8 text-right">
                  <div className="flex flex-col items-end gap-3 translate-x-2 opacity-80 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    <button 
                      onClick={() => {
                        const prop = properties[app.propertyId];
                        if (prop) onViewReport(app, prop);
                      }}
                      className="text-[11px] font-bold uppercase tracking-widest text-natural-primary hover:text-white hover:bg-natural-primary px-6 py-2 rounded-full border border-natural-primary transition-all"
                    >
                      {app.status === "rated" ? "View Insights" : "Review & Rate"}
                    </button>
                    {app.status !== "rated" && profile.role === "owner" && (
                      <button 
                        onClick={() => {
                          setEditingPrompt(app.id);
                          setPromptInput(app.ownerPrompt || "");
                        }}
                        className="text-[9px] font-bold uppercase tracking-widest text-natural-accent hover:text-natural-primary flex items-center gap-1.5"
                      >
                         <Shield className="h-3 w-3" />
                         Configure Agent
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {applications.length === 0 && (
          <div className="p-32 text-center bg-natural-bg/10 border-t border-natural-secondary">
             <div className="max-w-xs mx-auto space-y-4">
                <div className="mx-auto w-16 h-16 bg-natural-card rounded-2xl shadow-natural flex items-center justify-center text-natural-accent">
                   <UserIcon className="h-8 w-8" />
                </div>
                <h4 className="text-xl font-serif font-bold text-natural-primary">Archive empty</h4>
                <p className="text-natural-accent text-sm leading-relaxed italic font-serif">Awaiting the first candidates to initiate engagement with your listed estates.</p>
             </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingPrompt && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-natural-primary/20 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-natural-card rounded-[32px] p-10 shadow-2xl border border-black/5"
            >
              <h3 className="text-2xl font-serif font-bold text-natural-primary mb-2">Agent Directives</h3>
              <p className="text-natural-accent text-sm mb-8">Provide custom priorities or specific questions for the AI agent to focus on during this candidate's interview.</p>
              
              <textarea 
                value={promptInput}
                onChange={e => setPromptInput(e.target.value)}
                placeholder="e.g., Ask about their long-term stability and if they have experience maintaining historical gardens..."
                className="w-full h-40 bg-natural-bg rounded-2xl p-6 text-sm font-serif italic border border-black/5 outline-none focus:border-natural-primary resize-none shadow-inner"
              />

              <div className="flex justify-end gap-4 mt-10">
                <button onClick={() => setEditingPrompt(null)} className="text-[11px] font-bold uppercase tracking-widest text-natural-accent hover:text-natural-primary">Cancel</button>
                <button 
                  onClick={() => savePrompt(editingPrompt)}
                  className="rounded-full bg-natural-primary px-10 py-3 text-[11px] font-bold uppercase tracking-widest text-white shadow-natural hover:opacity-95"
                >
                  Save Directives
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PropertyForm({ onCancel, onSuccess, ownerId }: { onCancel: () => void, onSuccess: () => void, ownerId: string }) {
  const [address, setAddress] = useState("");
  const [beds, setBeds] = useState(1);
  const [baths, setBaths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (address && address.length >= 3 && !aiResult && !suggestions.includes(address)) {
        setIsSearching(true);
        const res = await searchAddresses(address);
        setSuggestions(res);
        setShowDropdown(res.length > 0);
        setIsSearching(false);
      } else if (!address) {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [address, aiResult]);

  const handleSelectAddress = (addr: string) => {
    setAddress(addr);
    setSuggestions([]);
    setShowDropdown(false);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setShowDropdown(false);
    try {
      const result = await generateListingInfo(address, beds, baths);
      setAiResult(result);
    } catch (err) {
      console.error(err);
      alert("Failed to generate listing info. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!aiResult) return;
    setLoading(true);
    try {
      const propData: Partial<Property> = {
        ownerId,
        address,
        bedrooms: beds,
        bathrooms: baths,
        listingTitle: aiResult.listingTitle,
        listingDescription: aiResult.listingDescription,
        suggestedPrice: aiResult.suggestedPrice,
        actualPrice: aiResult.suggestedPrice,
        neighborhood: aiResult.neighborhood,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "properties"), propData);
      onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "properties");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <div className="rounded-[20px] bg-natural-card p-10 shadow-natural border border-black/5">
        <h2 className="text-3xl font-serif font-bold text-natural-primary mb-8">List your property</h2>
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-3 space-y-3 relative">
            <label className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">Property Address</label>
            <div className="relative">
              <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-natural-accent" />
              <input 
                required
                value={address}
                onChange={e => {
                  setAddress(e.target.value);
                  setAiResult(null); // Reset when user types again
                }}
                onFocus={() => address.length >= 3 && suggestions.length > 0 && setShowDropdown(true)}
                placeholder="Start typing an address..."
                className="w-full rounded-2xl border border-natural-secondary bg-natural-bg/30 py-4 pl-14 pr-12 outline-none transition-all focus:border-natural-primary"
              />
              {isSearching && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-natural-accent" />
                </div>
              )}
            </div>

            <AnimatePresence>
              {showDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-natural-secondary overflow-hidden max-h-[300px] overflow-y-auto"
                >
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectAddress(suggestion)}
                      className="w-full text-left px-6 py-4 text-sm font-medium text-natural-text hover:bg-natural-bg transition-colors flex items-center gap-3 border-b border-natural-secondary last:border-0"
                    >
                      <MapPin className="h-4 w-4 text-natural-accent" />
                      {suggestion}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">Bedrooms</label>
            <input 
              type="number"
              value={beds}
              onChange={e => setBeds(Number(e.target.value))}
              className="w-full rounded-2xl border border-natural-secondary bg-natural-bg/30 p-4 outline-none focus:border-natural-primary"
            />
          </div>
          
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">Bathrooms</label>
            <input 
              type="number"
              value={baths}
              onChange={e => setBaths(Number(e.target.value))}
              className="w-full rounded-2xl border border-natural-secondary bg-natural-bg/30 p-4 outline-none focus:border-natural-primary"
            />
          </div>

          <div className="flex items-end">
            <button 
              disabled={loading}
              className="w-full h-[60px] rounded-full bg-natural-primary text-white font-bold transition-opacity hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-natural"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Generate with AI"}
            </button>
          </div>
        </form>
      </div>

      {aiResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[20px] bg-natural-card p-10 shadow-natural space-y-10"
        >
          <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4">
            <div className="space-y-2">
              <span className="bg-natural-secondary text-natural-primary px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest">AI Result</span>
              <h3 className="text-3xl font-serif font-bold text-natural-primary leading-tight">"{aiResult.listingTitle}"</h3>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">Suggested Price</div>
              <div className="text-4xl font-serif font-bold text-natural-primary">${aiResult.suggestedPrice}<span className="text-sm font-normal text-natural-accent ml-1">/mo</span></div>
            </div>
          </div>

          <div className="grid gap-12 md:grid-cols-2">
            <div className="space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent border-b border-natural-secondary pb-2">Listing Description</div>
              <div className="text-natural-text leading-relaxed font-serif text-lg bg-[#fafaf8] p-6 border-l-4 border-natural-primary italic rounded-r-lg">
                {aiResult.listingDescription}
              </div>
            </div>
            
            <div className="space-y-8">
              <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent border-b border-natural-secondary pb-2">Neighborhood Insights</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center justify-center rounded-2xl bg-natural-bg p-4 text-center ring-1 ring-natural-secondary">
                  <School className="mb-2 h-5 w-5 text-natural-primary" />
                  <div className="text-xl font-bold text-natural-primary">{aiResult.neighborhood.schools.length}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-natural-accent">Schools</div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-2xl bg-natural-bg p-4 text-center ring-1 ring-natural-secondary">
                  <Dumbbell className="mb-2 h-5 w-5 text-natural-primary" />
                  <div className="text-xl font-bold text-natural-primary">{aiResult.neighborhood.gyms.length}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-natural-accent">Gyms</div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-2xl bg-natural-bg p-4 text-center ring-1 ring-natural-secondary">
                  <Shield className="mb-2 h-5 w-5 text-natural-primary" />
                  <div className="text-xl font-bold text-natural-primary">{aiResult.neighborhood.safetyScore}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-natural-accent">Safety</div>
                </div>
              </div>
              <div className="space-y-4">
                 <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">Points of Interest</div>
                 <div className="flex flex-wrap gap-2">
                    {aiResult.neighborhood.pois.map((poi: string, i: number) => (
                      <span key={i} className="rounded-full bg-natural-secondary px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-natural-primary">
                        {poi}
                      </span>
                    ))}
                 </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-6 border-t border-natural-secondary pt-10">
            <button onClick={onCancel} className="px-8 py-3 text-sm font-bold uppercase tracking-widest text-natural-accent hover:text-natural-primary transition-colors">Discard</button>
            <button 
              onClick={handleSave}
              className="rounded-full bg-natural-primary px-12 py-3 text-sm font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-95 shadow-natural"
            >
              Publish Listing
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ApplicantDashboard({ profile, onBrowse, onContinueInterview }: { profile: Profile, onBrowse: () => void, onContinueInterview: (app: Application, prop: Property) => void }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [properties, setProperties] = useState<Record<string, Property>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "applications"), 
      where("applicantId", "==", profile.uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, async (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application));
      setApplications(apps);
      
      const props: Record<string, Property> = {};
      await Promise.all(apps.map(async app => {
        if (!props[app.propertyId]) {
          const snap = await getDoc(doc(db, "properties", app.propertyId));
          if (snap.exists()) props[app.propertyId] = { ...snap.data(), id: snap.id } as Property;
        }
      }));
      setProperties(props);
      setLoading(false);
    });
  }, [profile.uid]);

  if (loading) return <div className="p-8 text-center text-natural-accent font-serif text-sm uppercase tracking-widest">Scanning network...</div>;

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold tracking-tight text-natural-primary">Your Activity</h2>
          <p className="text-natural-accent">Track your interview progress and view rating results.</p>
        </div>
        <button 
          onClick={onBrowse}
          className="flex items-center gap-2 rounded-full bg-natural-primary px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 shadow-natural w-full sm:w-auto justify-center"
        >
          <Search className="h-4 w-4" />
          Find Properties
        </button>
      </header>

      {applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] bg-natural-card p-20 text-center shadow-natural border border-black/5">
          <div className="mb-4 rounded-[20px] bg-natural-bg p-6 text-natural-accent">
            <Search className="h-10 w-10" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-natural-primary">Haven't applied anywhere?</h3>
          <p className="mb-6 text-natural-accent max-w-sm mx-auto">Start your journey by browsing available properties in your area. Your conversation with the homeowner will help you secure your spot.</p>
          <button onClick={onBrowse} className="text-natural-primary font-bold uppercase tracking-widest text-[11px] hover:underline">Explore Marketplace →</button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {applications.map(app => {
            const prop = properties[app.propertyId];
            if (!prop) return null;
            return (
              <div 
                key={app.id} 
                onClick={() => onContinueInterview(app, prop)}
                className="group cursor-pointer rounded-[20px] bg-natural-card p-8 shadow-natural flex flex-col sm:flex-row gap-8 transition-all hover:scale-[1.01]"
              >
                <div className="h-24 w-24 flex-shrink-0 rounded-[15px] bg-natural-bg border border-black/5 flex items-center justify-center overflow-hidden">
                   <img src={`https://picsum.photos/seed/${prop.id}/200/200`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Building" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-natural-primary mb-1">{prop.address}</div>
                    <h4 className="text-lg font-serif font-bold text-natural-primary leading-tight">{prop.listingTitle}</h4>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                       {app.status === "rated" ? (
                         <div className="flex items-center gap-1.5 text-natural-primary font-serif font-bold text-sm">
                           <CheckCircle2 className="h-4 w-4" />
                           Engagement Recorded
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 text-natural-accent font-serif font-bold text-sm">
                           <Clock className="h-4 w-4 animate-pulse" />
                           Active Interview
                         </div>
                       )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-natural-secondary group-hover:text-natural-primary transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrowseListings({ onSelect }: { onSelect: (p: Property) => void }) {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    const q = query(collection(db, "properties"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setProperties(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Property)));
    });
  }, []);

  return (
    <div className="space-y-10 pb-20">
      <h2 className="text-3xl font-serif font-bold tracking-tight text-natural-primary">Marketplace</h2>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {properties.map(prop => (
          <div 
            key={prop.id} 
            onClick={() => onSelect(prop)}
            className="group cursor-pointer rounded-[20px] bg-natural-card p-1 shadow-natural transition-all hover:scale-[1.02]"
          >
            <div className="aspect-[4/3] rounded-[18px] bg-natural-bg mb-4 overflow-hidden relative">
              <img src={`https://picsum.photos/seed/${prop.id}/600/400`} alt="Home" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 h-[280px]" referrerPolicy="no-referrer" />
              <div className="absolute top-4 right-4 rounded-full bg-natural-card/95 backdrop-blur-md px-5 py-2 font-serif font-bold text-sm shadow-natural text-natural-primary">
                ${prop.actualPrice}<span className="text-[10px] text-natural-accent font-normal ml-0.5">/mo</span>
              </div>
            </div>
            <div className="px-5 pb-5 pt-1 space-y-4">
               <div>
                  <h4 className="text-lg font-serif font-bold text-natural-primary truncate tracking-tight mb-1">{prop.listingTitle}</h4>
                  <p className="text-[11px] text-natural-accent font-bold uppercase tracking-widest flex items-center gap-1"><MapPin className="h-3 w-3" /> {prop.address}</p>
               </div>
               <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-natural-accent">
                  <span className="flex items-center gap-1.5 text-natural-text">
                    <Building2 className="h-3.5 w-3.5" /> {prop.bedrooms} Bed
                  </span>
                  <span>{prop.bathrooms} Bath</span>
                  <div className="ml-auto flex items-center gap-1 text-natural-primary">
                    <Shield className="h-3.5 w-3.5" />
                     {prop.neighborhood.safetyScore}%
                  </div>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertyDetails({ property, profile, onBack, onApply }: { property: Property, profile: Profile, onBack: () => void, onApply: () => void }) {
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    if (profile.role !== "applicant") return;
    const q = query(collection(db, "applications"), where("propertyId", "==", property.id), where("applicantId", "==", profile.uid));
    return onSnapshot(q, (snapshot) => {
      setHasApplied(!snapshot.empty);
    });
  }, [property.id, profile.uid, profile.role]);

  return (
    <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 bg-natural-card rounded-[32px] p-8 lg:p-14 shadow-natural">
      <div className="space-y-10">
        <button onClick={onBack} className="text-[11px] font-bold uppercase tracking-widest text-natural-accent hover:text-natural-primary mb-2 transition-colors flex items-center gap-2">← {profile.role === "owner" ? "Dashboard" : "Marketplace"}</button>
        <div className="aspect-[16/10] rounded-[24px] bg-natural-bg overflow-hidden shadow-xl relative ring-1 ring-black/5">
           <img src={`https://picsum.photos/seed/${property.id}/1000/800`} className="w-full h-full object-cover" alt="Home" referrerPolicy="no-referrer" />
           <div className="absolute top-4 left-4">
              <span className="bg-natural-secondary text-natural-primary px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">Verified Listing</span>
           </div>
        </div>
        
        <div className="grid grid-cols-3 gap-6">
           <div className="rounded-[20px] bg-natural-bg p-5 text-center border border-black/5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mb-1">Beds</div>
              <div className="text-2xl font-serif font-bold text-natural-primary">{property.bedrooms}</div>
           </div>
           <div className="rounded-[20px] bg-natural-bg p-5 text-center border border-black/5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mb-1">Baths</div>
              <div className="text-2xl font-serif font-bold text-natural-primary">{property.bathrooms}</div>
           </div>
           <div className="rounded-[20px] bg-natural-bg p-5 text-center border border-black/5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mb-1">Safety</div>
              <div className="text-2xl font-serif font-bold text-natural-primary">{property.neighborhood.safetyScore}%</div>
           </div>
        </div>

        <div className="space-y-8">
           <h3 className="text-[11px] font-bold uppercase tracking-widest text-natural-accent border-b border-natural-secondary pb-3">Neighborhood Profile</h3>
           <div className="grid grid-cols-2 gap-10">
              <div className="space-y-4">
                 <div className="flex items-center gap-2 text-[10px] font-bold text-natural-primary uppercase tracking-widest"><School className="h-4 w-4" /> Education</div>
                 <ul className="space-y-3 text-sm text-natural-text font-medium">
                   {property.neighborhood.schools.map((s, i) => <li key={i} className="flex items-center gap-3"><div className="h-1.5 w-1.5 rounded-full bg-natural-accent" />{s}</li>)}
                 </ul>
              </div>
              <div className="space-y-4">
                 <div className="flex items-center gap-2 text-[10px] font-bold text-natural-primary uppercase tracking-widest"><Dumbbell className="h-4 w-4" /> Wellness</div>
                 <ul className="space-y-3 text-sm text-natural-text font-medium">
                   {property.neighborhood.gyms.map((s, i) => <li key={i} className="flex items-center gap-3"><div className="h-1.5 w-1.5 rounded-full bg-natural-accent" />{s}</li>)}
                 </ul>
              </div>
           </div>
        </div>
      </div>

      <div className="flex flex-col justify-between py-4">
        <div className="space-y-10">
          <div className="space-y-4">
            <h2 className="text-5xl font-serif font-bold text-natural-primary leading-tight tracking-tight">{property.listingTitle}</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest text-natural-accent flex items-center gap-2 bg-natural-bg w-fit px-4 py-1.5 rounded-full">
              <MapPin className="h-3.5 w-3.5" /> {property.address}
            </p>
          </div>
          
          <div className="border-y border-natural-secondary py-12">
            <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent mb-4">Monthly Investment</div>
            <div className="flex items-baseline gap-3 text-6xl font-serif font-bold text-natural-primary">
              ${property.actualPrice}
              <span className="text-sm font-sans font-bold uppercase tracking-widest text-natural-accent">Per Month</span>
            </div>
          </div>

          <div className="text-natural-text leading-relaxed font-serif text-lg bg-[#fafaf8] p-8 border-l-4 border-natural-primary italic rounded-r-lg">
             <Markdown>{property.listingDescription}</Markdown>
          </div>
        </div>

        <div className="pt-12">
          {profile.role === "applicant" && (
            <button 
              disabled={hasApplied}
              onClick={onApply}
              className={cn(
                "w-full rounded-full py-6 text-sm font-bold uppercase tracking-widest text-white transition-all shadow-natural active:scale-[0.98]",
                hasApplied ? "bg-natural-secondary text-natural-accent cursor-not-allowed" : "bg-natural-primary hover:opacity-95"
              )}
            >
              {hasApplied ? "Interview in Progress" : "Apply & Schedule Interview"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InterviewAgent({ application: initialApplication, property, profile, onBack }: { application: Application, property: Property | null, profile: Profile, onBack: () => void }) {
  const [application, setApplication] = useState(initialApplication);
  
  const sanitize = (transcript: any[]) => {
    return transcript.map((m, i) => {
      if (i === 0 && m.role === "model" && m.text.includes("AI rental agent")) {
        return { 
          ...m, 
          text: "Hello! Thank you for your interest in my property. I'd love to chat and get to know you a bit better before we move forward. Shall we begin?" 
        };
      }
      return m;
    });
  };

  const [messages, setMessages] = useState<any[]>(() => sanitize(initialApplication.interviewTranscript || []));

  // Sync with Firestore for real-time updates (especially for reports)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "applications", initialApplication.id), (snap) => {
      if (snap.exists()) {
        const data = { ...snap.data(), id: snap.id } as Application;
        setApplication(data);
        
        // Only update messages if the transcript has actually changed in length or content
        const transcript = data.interviewTranscript || [];
        if (transcript.length > 0) {
          setMessages(sanitize(transcript));
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `applications/${initialApplication.id}`));
    return unsub;
  }, [initialApplication.id]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [credit, setCredit] = useState(initialApplication.creditScore || 700);

  const runManualEvaluation = async () => {
    if (evaluating) return;
    setEvaluating(true);
    try {
      const rating = await rateCandidate(messages, { ...profile, creditScore: credit }, property);
      await updateDoc(doc(db, "applications", application.id), {
        aiRating: rating,
        status: "rated"
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `applications/${application.id}`);
    } finally {
      setEvaluating(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await conductInterviewChunk(newMessages, property, { 
        applicantName: profile.displayName,
        creditScore: credit
      }, application.ownerPrompt);

      const updatedMessages = [...newMessages, { role: "model", text: response }];
      setMessages(updatedMessages);

      if (response.includes("get back to you with a decision soon")) {
         const rating = await rateCandidate(updatedMessages, { ...profile, creditScore: credit }, property);
         await updateDoc(doc(db, "applications", application.id), {
           interviewTranscript: updatedMessages,
           status: "rated",
           aiRating: rating,
           creditScore: credit
         });
      } else {
         await updateDoc(doc(db, "applications", application.id), {
           interviewTranscript: updatedMessages,
           status: "interviewing",
           creditScore: credit
         });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `applications/${application.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-[320px_1fr] gap-8 h-[740px] mb-20">
      <div className="bg-natural-card rounded-[20px] p-8 shadow-natural flex flex-col justify-between border border-black/5">
        <div className="space-y-8">
           <button onClick={onBack} className="text-[10px] font-bold uppercase tracking-widest text-natural-accent hover:text-natural-primary transition-colors flex items-center gap-1">← Save & Exit</button>
           <div className="space-y-6">
              <div className="flex items-center gap-4">
                 <div className="h-16 w-16 rounded-[15px] bg-natural-secondary flex items-center justify-center text-natural-primary shadow-lg overflow-hidden border border-natural-primary/10">
                    <img src="https://picsum.photos/seed/homeowner/100/100" className="w-full h-full object-cover opacity-60" alt="Homeowner" referrerPolicy="no-referrer" />
                 </div>
                 <div>
                    <div className="text-lg font-serif font-bold text-natural-primary leading-tight">The Homeowner</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-natural-accent">Property Owner</div>
                 </div>
              </div>
              <p className="text-sm text-natural-text leading-relaxed font-serif italic bg-natural-bg p-4 rounded-lg border border-black/5">
                 Verifying credentials for {property?.listingTitle || "property"}.
              </p>
           </div>
           
           {profile.role === "applicant" && application.status !== "rated" && (
             <div className="space-y-6 pt-8 border-t border-natural-secondary">
               <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-natural-accent">Credit Rating</label>
                  <div className="text-3xl font-serif font-bold text-natural-primary">{credit}</div>
               </div>
               <input 
                 type="range" min="300" max="850" 
                 value={credit} 
                 onChange={e => setCredit(Number(e.target.value))} 
                 className="w-full h-1 bg-natural-bg rounded-lg appearance-none cursor-pointer accent-natural-primary"
               />
               <div className="flex justify-between text-[10px] font-bold text-natural-accent/40 uppercase tracking-widest font-mono">
                  <span>Below 500</span>
                  <span>Above 800</span>
               </div>
             </div>
           )}
        </div>

        {application.aiRating && profile.role === "owner" && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] bg-natural-primary p-8 text-white relative shadow-natural overflow-hidden"
          >
             <div className="absolute top-0 right-0 h-24 w-24 bg-natural-secondary/10 rounded-full blur-3xl -mr-12 -mt-12" />
             <div className="text-[9px] font-bold uppercase tracking-widest text-natural-secondary mb-2">Verdict Issued</div>
             <div className="text-5xl font-serif font-bold mb-1 tracking-tight">{application.aiRating.score}%</div>
             <div className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4">Qualification Index</div>
             <p className="text-[11px] text-white/70 italic leading-relaxed">Owner has received the full AI analysis report.</p>
          </motion.div>
        )}
      </div>

      <div className="bg-natural-card rounded-[20px] shadow-natural flex flex-col overflow-hidden relative border border-black/5">
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[radial-gradient(#e9e6dd_1.5px,transparent_1.5px)] [background-size:32px_32px]">
          {profile.role === "owner" && (
            application.aiRating?.feedback ? (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 p-10 bg-white rounded-[40px] border-2 border-natural-primary shadow-[0_32px_64px_-16px_rgba(42,39,33,0.2)] relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-10">
                  <div className="h-16 w-16 bg-natural-primary rounded-2xl rotate-12 flex items-center justify-center text-white shadow-xl">
                    <Star className="h-8 w-8 fill-current" />
                  </div>
                </div>
                
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-natural-secondary/30 text-natural-primary text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
                    <Shield className="h-3 w-3" />
                    Verified AI Analysis
                  </div>
                  
                  <h3 className="text-4xl font-serif font-bold text-natural-primary mb-8 leading-[1.1]">Executive Candidate Oversight</h3>
                  
                  <div className="grid gap-8 mb-10">
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent/60">Verification Summary</div>
                      <div className="prose prose-sm font-serif italic text-natural-text text-lg leading-relaxed">
                        {application.aiRating.feedback.split('\n').map((para, i) => (
                          <p key={i} className="mb-6 last:mb-0 leading-relaxed">{para}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 border-t border-natural-secondary/50 flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="text-6xl font-serif font-bold text-natural-primary tracking-tighter">{application.aiRating.score}%</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-natural-accent leading-tight">
                        Match<br />Confidence
                      </div>
                    </div>
                    <div className="px-6 py-3 rounded-xl bg-natural-bg border border-black/5 text-[10px] font-bold uppercase tracking-widest text-natural-accent italic">
                      Final Assessment Logged: {new Date(application.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Decorative accents */}
                <div className="absolute bottom-0 right-0 opacity-[0.03] pointer-events-none">
                   <Building2 className="h-64 w-64 -mb-16 -mr-16" />
                </div>
              </motion.div>
            ) : (
              (application.status === "interviewing" || application.status === "pending") && (
                <div className="mb-12 p-10 bg-natural-secondary/10 rounded-[40px] border border-dashed border-natural-accent/30 text-center">
                   <div className="inline-block p-4 rounded-full bg-natural-bg shadow-sm mb-4">
                      <Clock className="h-6 w-6 text-natural-accent animate-spin-slow" />
                   </div>
                   <h4 className="text-lg font-serif font-bold text-natural-primary mb-2">
                     {profile.role === "owner" ? "Evaluation Pending" : "Under Review"}
                   </h4>
                   <p className="text-sm text-natural-accent max-w-xs mx-auto italic mb-8">
                     {profile.role === "owner" 
                       ? "The AI agent is monitoring this conversation. You can wait for it to conclude or trigger a summary report now."
                       : "The homeowner is reviewing your conversation. They will get back to you with a decision shortly."}
                   </p>
                   
                   {profile.role === "owner" && (
                     <button
                       onClick={runManualEvaluation}
                       disabled={evaluating || messages.length < 2}
                       className="bg-natural-primary text-white px-8 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-natural-accent transition-all shadow-lg disabled:opacity-50 flex items-center gap-2 mx-auto"
                     >
                       {evaluating ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                       {evaluating ? "Synthesizing Report..." : "Force AI Evaluation"}
                     </button>
                   )}
                </div>
              )
            )
          )}

          <div className="text-center py-4">
             <div className="inline-block px-6 py-1.5 rounded-full bg-natural-bg border border-black/5 text-[9px] font-bold uppercase tracking-[0.3em] text-natural-accent/60">Conversation Transcript Below</div>
          </div>

          {messages.map((m, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={i} 
              className={cn(
                "flex max-w-[85%]",
                m.role === "user" ? "ml-auto" : "mr-auto"
              )}
            >
              <div className={cn(
                "px-8 py-5 font-serif text-[15px] leading-relaxed relative",
                m.role === "user" 
                  ? "bg-natural-primary text-white rounded-[24px_24px_0_24px] shadow-lg" 
                  : "bg-natural-card text-natural-text rounded-[24px_24px_24px_0] border border-black/5 shadow-sm"
              )}>
                {m.text}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex items-center gap-3 text-natural-accent italic text-[11px] font-bold tracking-widest uppercase">
              <Loader2 className="h-4 w-4 animate-spin" />
              Homeowner is reviewing...
            </div>
          )}
        </div>

        {(application.status !== "rated" && profile.role === "applicant") ? (
          <form onSubmit={sendMessage} className="p-8 border-t border-natural-secondary flex gap-4 bg-natural-card">
            <input 
              value={input}
              disabled={loading}
              onChange={e => setInput(e.target.value)}
              placeholder="Tell me about your background..."
              className="flex-1 bg-natural-bg rounded-2xl px-8 py-5 border border-black/5 outline-none focus:border-natural-primary text-sm font-serif italic"
            />
            <button 
              disabled={loading}
              className="rounded-full bg-natural-primary text-white px-10 font-bold uppercase tracking-widest text-[11px] hover:opacity-95 transition-opacity disabled:opacity-50 shadow-natural"
            >
              Send response
            </button>
          </form>
        ) : (
          <div className="p-10 border-t border-natural-secondary text-center bg-natural-bg/30">
             <div className="text-[11px] font-bold uppercase tracking-widest text-natural-accent">The evaluation process has concluded.</div>
          </div>
        )}
      </div>
    </div>
  );
}
