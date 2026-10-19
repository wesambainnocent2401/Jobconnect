import {
    Client,
    Account,
    TablesDB,
    ID,
    Query,
    Permission,
    Role
} from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";


// ==========================================
// 1. APPWRITE CONFIGURATION
// ==========================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6ad0cec40008cbc36720";

const DATABASE_ID = "Jobconnect";

const PROFILES_TABLE = "profiles";
const JOBS_TABLE = "jobs";
const APPLICATIONS_TABLE = "Application";


const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

const account = new Account(client);
const tablesDB = new TablesDB(client);


// ==========================================
// 2. GENERAL HELPERS
// ==========================================

function getElement(id) {
    return document.getElementById(id);
}

function value(id) {
    return getElement(id)?.value?.trim() || "";
}

function setValue(id, text) {
    const element = getElement(id);

    if (element) {
        element.value = text ?? "";
    }
}

function showMessage(message) {
    alert(message);
}

function escapeHTML(text = "") {
    return String(text).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function optionalURL(text) {
    const cleaned = String(text || "").trim();

    if (!cleaned) return undefined;

    try {
        const url = new URL(cleaned);

        if (!["http:", "https:"].includes(url.protocol)) {
            return undefined;
        }

        return cleaned;
    } catch {
        return undefined;
    }
}

function optionalNumber(text) {
    if (text === "" || text === null || text === undefined) {
        return undefined;
    }

    const number = Number(text);

    return Number.isFinite(number) ? number : undefined;
}

function cleanData(data) {
    const cleaned = {};

    for (const [key, item] of Object.entries(data)) {
        if (item !== undefined && item !== null) {
            cleaned[key] = item;
        }
    }

    return cleaned;
}

function todayString() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function isExpired(deadline) {
    if (!deadline) return false;

    return deadline < todayString();
}

function isJobOpen(job) {
    return job.status === "open" && !isExpired(job.deadlines);
}

function getMatchLabel(score) {
    if (score >= 80) return "Excellent match";
    if (score >= 60) return "Good match";
    if (score >= 40) return "Fair match";

    return "Low match";
}

function formatDate(date) {
    if (!date) return "Not available";

    return new Date(date).toLocaleDateString();
}

function getJobs() {
    return window.jobsCache || [];
}

function getApplications() {
    return window.applicationsCache || [];
}


// ==========================================
// 3. AUTHENTICATION
// ==========================================

async function getCurrentUser() {
    try {
        return await account.get();
    } catch {
        return null;
    }
}

async function getMyProfile() {
    const user = await getCurrentUser();

    if (!user) return null;

    try {
        const result = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: PROFILES_TABLE,
            queries: [
                Query.equal("userId", user.$id),
                Query.limit(1)
            ]
        });

        return result.rows[0] || null;

    } catch (error) {
        console.error("Could not load profile:", error);
        return null;
    }
}

async function requireLogin() {
    const user = await getCurrentUser();

    if (!user) {
        const next = encodeURIComponent(
            window.location.pathname.split("/").pop() +
            window.location.search
        );

        window.location.href = `login.html?next=${next}`;

        return null;
    }

    return user;
}

async function logout() {
    try {
        await account.deleteSession("current");

        window.location.href = "index.html";

    } catch (error) {
        console.error(error);
        showMessage("Could not log out. Please try again.");
    }
}

window.logout = logout;


// ==========================================
// 4. REGISTRATION
// ==========================================

async function handleRegistration(event) {
    event.preventDefault();

    const name = value("registerName");
    const email = value("registerEmail").toLowerCase();
    const phone = value("registerPhone");
    const role = value("accountType");
    const password = value("registerPassword");
    const confirmPassword = value("registerConfirm");

    if (!name || !email || !password || !role) {
        showMessage("Please complete all required fields.");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Your passwords do not match.");
        return;
    }

    if (password.length < 8) {
        showMessage("Your password must be at least 8 characters.");
        return;
    }

    if (!["jobseeker", "employer"].includes(role)) {
        showMessage("Please select a valid account type.");
        return;
    }

    const submitButton = event.submitter;

    if (submitButton) submitButton.disabled = true;

    try {
        const newUser = await account.create({
            userId: ID.unique(),
            email,
            password,
            name
        });

        await account.createEmailPasswordSession({
            email,
            password
        });

        await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: PROFILES_TABLE,
            rowId: ID.unique(),

            data: {
                userId: newUser.$id,
                fullName: name,
                Phone: phone,
                role,
                location: "Not provided",
                email
            },

            permissions: [
                Permission.read(Role.user(newUser.$id)),
                Permission.update(Role.user(newUser.$id)),
                Permission.delete(Role.user(newUser.$id))
            ]
        });

        showMessage("Your JobConnect account has been created!");

        if (role === "employer") {
            window.location.href = "employer-dashboard.html";
        } else {
            window.location.href = "index.html";
        }

    } catch (error) {
        console.error("Registration error:", error);

        showMessage(
            error.message ||
            "Registration failed. Please check your details and try again."
        );

    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}




// ==========================================
// LOGIN SYSTEM
// ==========================================

async function handleLogin(event) {
    window.handleLogin = handleLogin;
    event.preventDefault();

    const email = document.getElementById("loginEmail")?.value
        .trim()
        .toLowerCase();

    const password = document.getElementById("loginPassword")?.value;

    const submitButton = event.submitter ||
        document.querySelector("#loginForm button[type='submit']");

    if (!email || !password) {
        showMessage("Please enter your email and password.");
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Logging in...";
    }

    try {
        // Sign in with Appwrite
        await account.createEmailPasswordSession({
            email: email,
            password: password
        });

        // Retrieve the user's JobConnect profile
        const profile = await getMyProfile();

        if (!profile) {
            showMessage(
                "You are signed in, but your JobConnect profile could not be found. Please contact support."
            );
            return;
        }

        // Redirect according to account role
        if (profile.role === "employer") {
            window.location.href = "employer-dashboard.html";
            return;
        }

        // Respect a safe requested destination
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");

        if (
            next &&
            !next.includes("://") &&
            !next.startsWith("//") &&
            !next.includes("login.html")
        ) {
            window.location.href = next;
        } else {
            window.location.href = "index.html";
        }

    } catch (error) {
        console.error("Login error:", error);

        showMessage(
            error.message || "Login failed. Please check your email and password."
        );

    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Log in";
        }
    }
}


// ==========================================
// CONNECT LOGIN FORM
// ==========================================

function initializeLoginForm() {
    const loginForm = document.getElementById("loginForm");

    if (!loginForm) return;

    loginForm.addEventListener("submit", handleLogin);
}


// ==========================================
// SHOW / HIDE PASSWORD
// ==========================================

function initializePasswordToggle() {
    const showPassword = document.getElementById("showPassword");
    const passwordInput = document.getElementById("loginPassword");

    if (!showPassword || !passwordInput) return;

    showPassword.addEventListener("change", function () {
        passwordInput.type = this.checked ? "text" : "password";
    });
}


// ==========================================
// 6. AUTH BAR
// ==========================================

async function updateAuthBar() {
    const authBar = getElement("authBar");

    if (!authBar) return;

    const user = await getCurrentUser();

    if (!user) {
        authBar.innerHTML = `
            <a href="login.html">Login</a>
            <a href="register.html">Register</a>
        `;

        return;
    }

    const profile = await getMyProfile();

    const name = escapeHTML(
        profile?.fullName || user.name || "Account"
    );

    authBar.innerHTML = `
        <span>Welcome, ${name}</span>
        <a href="index.html">Home</a>
        ${
            profile?.role === "employer"
                ? `<a href="employer-dashboard.html">Dashboard</a>
                   <a href="my-jobs.html">My Jobs</a>`
                : `<a href="jobseeker.html">My Profile</a>
                   <a href="my-application.html">My Applications</a>`
        }
        <button type="button" onclick="logout()">Logout</button>
    `;
}


// ==========================================
// 7. NAVIGATION HELPERS
// ==========================================

async function goPostJob() {
    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (profile?.role !== "employer") {
        showMessage("Only employer accounts can post jobs.");
        return;
    }

    window.location.href = "employer.html";
}

async function goJobSeekerProfile() {
    const user = await requireLogin();

    if (!user) return;

    window.location.href = "jobseeker.html";
}

function goLogin() {
    window.location.href = "login.html";
}

window.goPostJob = goPostJob;
window.goJobSeekerProfile = goJobSeekerProfile;
window.goLogin = goLogin;


// ==========================================
// 8. LOAD JOBS
// ==========================================

async function loadJobs() {
    try {
        const result = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            queries: [
                Query.limit(100),
                Query.orderDesc("$createdAt")
            ]
        });

        window.jobsCache = result.rows || [];

        return window.jobsCache;

    } catch (error) {
        console.error("Could not load jobs:", error);

        showMessage(
            "Could not load jobs. Check your Appwrite permissions and connection."
        );

        return [];
    }
}


// ==========================================
// 9. HOMEPAGE JOB DISPLAY
// ==========================================

async function showJobs() {
    const jobs = await loadJobs();

    const container = getElement("jobsList");

    if (!container) return;

    const search = value("jobSearch").toLowerCase();
    const type = value("typeFilter").toLowerCase();

    const filtered = jobs.filter(job => {
        const searchable = [
            job.title,
            job.companyname,
            job.location,
            job.description,
            job.Skills
        ].join(" ").toLowerCase();

        return (
            isJobOpen(job) &&
            searchable.includes(search) &&
            (!type || job.employmenttype?.toLowerCase() === type)
        );
    });

    const count = getElement("resultsCount");

    if (count) {
        count.textContent = `${filtered.length} jobs found`;
    }

    if (!filtered.length) {
        container.innerHTML = `
            <p>No matching jobs found.</p>
        `;

        return;
    }

    container.innerHTML = filtered.map(job => `
        <article class="job-card">
            <h3>${escapeHTML(job.title)}</h3>

            <p>
                ${escapeHTML(job.companyname)}
            </p>

            <p>
                ${escapeHTML(job.location)}
            </p>

            <p>
                ${escapeHTML(job.employmenttype)}
            </p>

            <p>
                ${escapeHTML(job.Salary || "Salary not specified")}
            </p>

            <a href="job-details.html?job=${encodeURIComponent(job.$id)}">
                View Job
            </a>
        </article>
    `).join("");
}

window.showJobs = showJobs;


// ==========================================
// 10. JOB DETAILS
// ==========================================

async function loadJobDetails() {
    const container = getElement("jobDetails");

    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");

    if (!jobId) {
        container.innerHTML = "<p>Job not found.</p>";
        return;
    }

    try {
        const job = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: jobId
        });

        window.currentJob = job;

        const title = getElement("jobTitle");

        if (title) {
            title.textContent = job.title;
        }

        container.innerHTML = `
            <h2>${escapeHTML(job.title)}</h2>

            <h3>${escapeHTML(job.companyname)}</h3>

            <p><strong>Location:</strong>
                ${escapeHTML(job.location)}
            </p>

            <p><strong>Employment:</strong>
                ${escapeHTML(job.employmenttype)}
            </p>

            <p><strong>Salary:</strong>
                ${escapeHTML(job.Salary || "Not specified")}
            </p>

            <p><strong>Education:</strong>
                ${escapeHTML(job.Education || "Not specified")}
            </p>

            <p><strong>Experience:</strong>
                ${escapeHTML(String(job.experienceyears ?? "Not specified"))}
            </p>

            <p><strong>Skills:</strong>
                ${escapeHTML(job.Skills || "Not specified")}
            </p>

            <p><strong>Certifications:</strong>
                ${escapeHTML(job.certifications || "Not specified")}
            </p>

            <h3>Job Description</h3>
            <p>${escapeHTML(job.description)}</p>

            <h3>Responsibilities</h3>
            <p>${escapeHTML(job.responsibilities || "Not specified")}</p>

            <h3>Benefits</h3>
            <p>${escapeHTML(job.benefits || "Not specified")}</p>

            <p><strong>Positions:</strong>
                ${escapeHTML(String(job.positions))}
            </p>

            <p><strong>Application deadline:</strong>
                ${escapeHTML(job.deadlines || "Not specified")}
            </p>
        `;

        const section = getElement("applicationSection");

        if (section && !isJobOpen(job)) {
            section.innerHTML = "<p>This job is no longer accepting applications.</p>";
        }

    } catch (error) {
        console.error(error);

        container.innerHTML = "<p>Could not load this job.</p>";
    }
}


// ==========================================
// 11. APPLY FOR A JOB
// ==========================================

async function applyForJob(jobId) {
    window.location.href =
        `job-details.html?job=${encodeURIComponent(jobId)}`;
}

window.applyForJob = applyForJob;


async function handleApplication(event) {
    event.preventDefault();

    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (!profile || profile.role !== "jobseeker") {
        showMessage("Please use a job seeker account to apply.");
        return;
    }

    const job = window.currentJob;

    if (!job || !isJobOpen(job)) {
        showMessage("This job is no longer accepting applications.");
        return;
    }

    const applicantName = value("applicantName") || profile.fullName;
    const applicantEmail = value("applicantEmail") || profile.email;

    if (!applicantName || !applicantEmail) {
        showMessage("Please provide your name and email.");
        return;
    }

    const existing = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: APPLICATIONS_TABLE,
        queries: [
            Query.equal("jobid", job.$id),
            Query.equal("applicantid", user.$id),
            Query.limit(1)
        ]
    });

    if (existing.rows.length > 0) {
        showMessage("You have already applied for this job.");
        return;
    }

    const experience = optionalNumber(value("applicantExperience"));
    const portfolio = optionalURL(value("portfolio"));

    const applicationData = cleanData({
        jobid: job.$id,
        applicantid: user.$id,
        employerid: job.employerid,

        applicantname: applicantName,
        applicantemail: applicantEmail,

        applicantphone: value("applicantPhone") || undefined,
        education: value("applicantEducation") || undefined,
        experienceyears: experience,
        skills: value("applicantSkills") || undefined,

        certifications: profile.certifications || undefined,
        portfolioUrl: portfolio,
        coverMessage: value("coverMessage") || undefined,

        status: "pending"
    });

    try {
        await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: APPLICATIONS_TABLE,
            rowId: ID.unique(),

            data: applicationData,

            permissions: [
                Permission.read(Role.user(user.$id)),
                Permission.read(Role.user(job.employerid)),
                Permission.update(Role.user(job.employerid))
            ]
        });

        showMessage("Your application has been submitted!");

        window.location.href = "my-application.html";

    } catch (error) {
        console.error("Application error:", error);

        showMessage(
            error.message ||
            "Could not submit your application. Please try again."
        );
    }
}


// ==========================================
// 12. MATCHING SYSTEM
// ==========================================

function calculateMatch(job, application) {
    let score = 0;
    let total = 0;

    function addScore(condition, weight) {
        total += weight;

        if (condition) score += weight;
    }

    const jobSkills = (job.Skills || "")
        .toLowerCase()
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    const applicantSkills = (application.skills || "")
        .toLowerCase()
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    let skillMatch = false;

    if (jobSkills.length && applicantSkills.length) {
        skillMatch = jobSkills.some(skill =>
            applicantSkills.some(appSkill =>
                appSkill.includes(skill) || skill.includes(appSkill)
            )
        );
    }

    addScore(skillMatch, 40);

    const requiredExperience = Number(job.experienceyears || 0);
    const applicantExperience = Number(application.experienceyears || 0);

    addScore(
        applicantExperience >= requiredExperience,
        30
    );

    const requiredEducation = (job.Education || "").toLowerCase();
    const applicantEducation = (application.education || "").toLowerCase();

    addScore(
        !requiredEducation ||
        !applicantEducation ||
        applicantEducation.includes(requiredEducation),
        30
    );

    return total ? Math.round((score / total) * 100) : 0;
}


// ==========================================
// 13. EMPLOYER DASHBOARD
// ==========================================

async function renderDashboard() {
    const container = getElement("applicationsList");

    if (!container) return;

    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (profile?.role !== "employer") {
        container.innerHTML = "<p>Employer access required.</p>";
        return;
    }

    try {
        const jobsResult = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            queries: [
                Query.equal("employerid", user.$id),
                Query.limit(100)
            ]
        });

        const jobs = jobsResult.rows || [];
        const applications = [];

        for (const job of jobs) {
            const result = await tablesDB.listRows({
                databaseId: DATABASE_ID,
                tableId: APPLICATIONS_TABLE,
                queries: [
                    Query.equal("jobid", job.$id),
                    Query.limit(100)
                ]
            });

            for (const application of result.rows) {
                applications.push({
                    ...application,
                    jobTitle: job.title
                });
            }
        }

        window.applicationsCache = applications;

        const summary = getElement("dashboardSummary");

        if (summary) {
            summary.textContent =
                `${jobs.length} jobs posted · ${applications.length} applications received`;
        }

        if (!applications.length) {
            container.innerHTML = "<p>No applications received yet.</p>";
            return;
        }

        container.innerHTML = applications.map(application => {
            const job = jobs.find(item => item.$id === application.jobid);

            const match = job
                ? calculateMatch(job, application)
                : 0;

            return `
                <article class="application-card">
                    <h3>${escapeHTML(application.applicantname)}</h3>

                    <p>
                        Job: ${escapeHTML(application.jobTitle || "Unknown")}
                    </p>

                    <p>
                        Email: ${escapeHTML(application.applicantemail)}
                    </p>

                    <p>
                        Phone: ${escapeHTML(application.applicantphone || "Not provided")}
                    </p>

                    <p>
                        Match: ${match}% — ${getMatchLabel(match)}
                    </p>

                    <p>
                        Status: ${escapeHTML(application.status)}
                    </p>

                    <p>
                        Education: ${escapeHTML(application.education || "Not provided")}
                    </p>

                    <p>
                        Experience: ${escapeHTML(String(application.experienceyears ?? "Not provided"))}
                    </p>

                    <p>
                        Skills: ${escapeHTML(application.skills || "Not provided")}
                    </p>

                    <p>
                        Cover message:
                        ${escapeHTML(application.coverMessage || "None")}
                    </p>

                    <button
                        type="button"
                        onclick="shortlistApplicant('${application.$id}')"
                    >
                        Shortlist
                    </button>
                </article>
            `;
        }).join("");

    } catch (error) {
        console.error(error);

        container.innerHTML = `
            <p>Could not load applications. Check your Appwrite permissions.</p>
        `;
    }
}


async function shortlistApplicant(applicationId) {
    const user = await requireLogin();

    if (!user) return;

    try {
        const application = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: APPLICATIONS_TABLE,
            rowId: applicationId
        });

        if (application.employerid !== user.$id) {
            showMessage("You cannot update this application.");
            return;
        }

        await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: APPLICATIONS_TABLE,
            rowId: applicationId,

            data: {
                status: "shortlisted"
            }
        });

        showMessage("Applicant shortlisted.");

        await renderDashboard();

    } catch (error) {
        console.error(error);
        showMessage("Could not update application status.");
    }
}

window.shortlistApplicant = shortlistApplicant;


// ==========================================
// 14. POST A JOB
// ==========================================

async function handleJobPosting(event) {
    event.preventDefault();

    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (profile?.role !== "employer") {
        showMessage("Only employers can post jobs.");
        return;
    }

    const positions = optionalNumber(value("positions")) ?? 1;

    if (positions < 1) {
        showMessage("The number of positions must be at least 1.");
        return;
    }

    const companyName = value("companyName");
    const title = value("jobTitle");
    const location = value("jobLocation");
    const employmentType = value("employmentType");
    const description = value("description");

    if (
        !companyName ||
        !title ||
        !location ||
        !employmentType ||
        !description
    ) {
        showMessage("Please complete all required job details.");
        return;
    }

    const jobData = cleanData({
        employerid: user.$id,

        companyname: companyName,
        companyemail: value("companyEmail").toLowerCase() || undefined,
        companywebsite: optionalURL(value("companyWebsite")),
        companylocation: value("companyLocation") || undefined,
        companydescription: value("companyDescription") || undefined,
        companylogopath: optionalURL(value("companyLogo")),

        title,
        location,
        employmenttype: employmentType,

        Salary: value("salary") || undefined,
        Education: value("education") || undefined,

        experienceyears: optionalNumber(value("experience")),
        Skills: value("skills") || undefined,
        certifications: value("certifications") || undefined,

        description,
        responsibilities: value("responsibilities") || undefined,
        benefits: value("benefits") || undefined,

        positions,
        deadlines: value("deadline") || undefined,

        status: "open"
    });

    try {
        await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: ID.unique(),

            data: jobData,

            permissions: [
                Permission.read(Role.any()),
                Permission.update(Role.user(user.$id)),
                Permission.delete(Role.user(user.$id))
            ]
        });

        showMessage("Your job has been posted successfully!");

        window.location.href = "my-jobs.html";

    } catch (error) {
        console.error("Job posting error:", error);

        showMessage(
            error.message ||
            "Could not post your job. Please check your form and permissions."
        );
    }
}


// ==========================================
// 15. JOB SEEKER PROFILE
// ==========================================

async function loadProfileForm() {
    const form = getElement("profileForm");

    if (!form) return;

    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (!profile) {
        showMessage("Your profile could not be found.");
        return;
    }

    setValue("profileName", profile.fullName);
    setValue("profilePhone", profile.Phone);
    setValue("profileEmail", profile.email || user.email);
    setValue("profileLocation", profile.location);
    setValue("profileEducation", profile.education);
    setValue("profileField", profile.fieldOfStudy);
    setValue("profileSkills", profile.skills);
    setValue("profileExperience", profile.experienceYears);
    setValue("profileExperienceDetails", profile.experienceDetails);
    setValue("profilePortfolio", profile.portfolioUrl);

    setValue("refName", profile.refName);
    setValue("refPhone", profile.refPhone);
    setValue("refRelationship", profile.refRelationship);
}


async function handleProfileSave(event) {
    event.preventDefault();

    const user = await requireLogin();

    if (!user) return;

    const profile = await getMyProfile();

    if (!profile) {
        showMessage("Your profile could not be found.");
        return;
    }

    const data = cleanData({
        fullName: value("profileName"),
        Phone: value("profilePhone"),
        email: value("profileEmail").toLowerCase(),

        location: value("profileLocation") || "Not provided",

        education: value("profileEducation") || undefined,
        fieldOfStudy: value("profileField") || undefined,

        skills: value("profileSkills") || undefined,

        experienceYears: optionalNumber(value("profileExperience")),
        experienceDetails: value("profileExperienceDetails") || undefined,

        portfolioUrl: optionalURL(value("profilePortfolio")),

        refName: value("refName") || undefined,
        refPhone: value("refPhone") || undefined,
        refRelationship: value("refRelationship") || undefined
    });

    try {
        await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: PROFILES_TABLE,
            rowId: profile.$id,
            data
        });

        showMessage("Your profile has been updated.");

    } catch (error) {
        console.error(error);
        showMessage("Could not update your profile.");
    }
}


// ==========================================
// 16. MY APPLICATIONS
// ==========================================

async function renderMyApplications() {
    const container = getElement("myApplicationsList");

    if (!container) return;

    const user = await requireLogin();

    if (!user) return;

    try {
        const result = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: APPLICATIONS_TABLE,
            queries: [
                Query.equal("applicantid", user.$id),
                Query.limit(100),
                Query.orderDesc("$createdAt")
            ]
        });

        const applications = result.rows || [];

        const summary = getElement("applicationsSummary");

        if (summary) {
            summary.textContent =
                `You have submitted ${applications.length} applications.`;
        }

        if (!applications.length) {
            container.innerHTML = "<p>You have not applied for any jobs yet.</p>";
            return;
        }

        const cards = [];

        for (const application of applications) {
            let jobTitle = "Job no longer available";
            let company = "";

            try {
                const job = await tablesDB.getRow({
                    databaseId: DATABASE_ID,
                    tableId: JOBS_TABLE,
                    rowId: application.jobid
                });

                jobTitle = job.title;
                company = job.companyname;

            } catch {
                // The job may have been removed.
            }

            cards.push(`
                <article class="application-card">
                    <h3>${escapeHTML(jobTitle)}</h3>

                    <p>${escapeHTML(company)}</p>

                    <p>
                        Submitted: ${formatDate(application.$createdAt)}
                    </p>

                    <p>
                        Status: ${escapeHTML(application.status)}
                    </p>

                    <a href="job-details.html?job=${encodeURIComponent(application.jobid)}">
                        View Job
                    </a>
                </article>
            `);
        }

        container.innerHTML = cards.join("");

    } catch (error) {
        console.error(error);

        container.innerHTML = "<p>Could not load your applications.</p>";
    }
}


// ==========================================
// 17. MY JOBS
// ==========================================

async function renderMyJobs() {
    const container = getElement("myJobsList");

    if (!container) return;

    const user = await requireLogin();

    if (!user) return;

    try {
        const result = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            queries: [
                Query.equal("employerid", user.$id),
                Query.limit(100),
                Query.orderDesc("$createdAt")
            ]
        });

        const jobs = result.rows || [];

        const summary = getElement("myJobsSummary");

        if (summary) {
            summary.textContent = `You have posted ${jobs.length} jobs.`;
        }

        if (!jobs.length) {
            container.innerHTML = "<p>You have not posted any jobs yet.</p>";
            return;
        }

        container.innerHTML = jobs.map(job => `
            <article class="job-card">
                <h3>${escapeHTML(job.title)}</h3>

                <p>${escapeHTML(job.companyname)}</p>

                <p>${escapeHTML(job.location)}</p>

                <p>Status: ${escapeHTML(job.status)}</p>

                <p>Positions: ${escapeHTML(String(job.positions))}</p>

                <a href="job-details.html?job=${encodeURIComponent(job.$id)}">
                    View Job
                </a>

                <button
                    type="button"
                    onclick="toggleJobClosed('${job.$id}', '${job.status}')"
                >
                    ${job.status === "open" ? "Close Job" : "Reopen Job"}
                </button>

                <button
                    type="button"
                    onclick="deleteJob('${job.$id}')"
                >
                    Delete Job
                </button>
            </article>
        `).join("");

    } catch (error) {
        console.error(error);

        container.innerHTML = "<p>Could not load your jobs.</p>";
    }
}


// ==========================================
// 18. CLOSE OR REOPEN A JOB
// ==========================================

async function toggleJobClosed(jobId, currentStatus) {
    const user = await requireLogin();

    if (!user) return;

    const newStatus = currentStatus === "open" ? "closed" : "open";

    try {
        const job = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: jobId
        });

        if (job.employerid !== user.$id) {
            showMessage("You cannot change this job.");
            return;
        }

        await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: jobId,
            data: {
                status: newStatus
            }
        });

        showMessage(`Job ${newStatus}.`);

        await renderMyJobs();

    } catch (error) {
        console.error(error);
        showMessage("Could not update this job.");
    }
}


// ==========================================
// 19. DELETE A JOB
// ==========================================

async function deleteJob(jobId) {
    const user = await requireLogin();

    if (!user) return;

    if (!confirm("Are you sure you want to delete this job?")) {
        return;
    }

    try {
        const job = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: jobId
        });

        if (job.employerid !== user.$id) {
            showMessage("You cannot delete this job.");
            return;
        }

        await tablesDB.deleteRow({
            databaseId: DATABASE_ID,
            tableId: JOBS_TABLE,
            rowId: jobId
        });

        showMessage("Job deleted.");

        await renderMyJobs();

    } catch (error) {
        console.error(error);
        showMessage("Could not delete this job.");
    }
}


// ==========================================
// 20. SHOW / HIDE PASSWORD
// ==========================================

function setupPasswordToggle() {
    const checkbox = getElement("showPassword");

    if (!checkbox) return;

    checkbox.addEventListener("change", () => {
        ["registerPassword", "registerConfirm", "loginPassword"]
            .forEach(id => {
                const input = getElement(id);

                if (input) {
                    input.type = checkbox.checked ? "text" : "password";
                }
            });
    });
}


// ==========================================
// 21. CLEAR FILTERS
// ==========================================

function setupFilters() {
    const search = getElement("jobSearch");
    const type = getElement("typeFilter");
    const clear = getElement("clearFilters");

    if (search) {
        search.addEventListener("input", showJobs);
    }

    if (type) {
        type.addEventListener("change", showJobs);
    }

    if (clear) {
        clear.addEventListener("click", () => {
            if (search) search.value = "";
            if (type) type.value = "";

            showJobs();
        });
    }
}


// ==========================================
// 22. CONNECT FORMS AND PAGE INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    // Registration
    const registerForm = getElement("registerForm");

    if (registerForm) {
        registerForm.addEventListener("submit", handleRegistration);
    }

    // Login
    const loginForm = getElement("loginForm");

    if (loginForm) {
        loginForm.addEvent("submit", handleLogin);
    }

    // Job posting
    const jobForm = getElement("jobForm");

    if (jobForm) {
        jobForm.addEventListener("submit", handleJobPosting);
    }

    // Application
    const applicationForm = getElement("applicationForm");

    if (applicationForm) {
        applicationForm.addEventListener("submit", handleApplication);
    }

    // Profile
    const profileForm = getElement("profileForm");

    if (profileForm) {
        profileForm.addEventListener("submit", handleProfileSave);
    }

    setupPasswordToggle();
    setupFilters();

    await updateAuthBar();

    if (getElement("jobsList")) {
        await showJobs();
    }

    if (getElement("jobDetails")) {
        await loadJobDetails();
    }

    if (getElement("profileForm")) {
        await loadProfileForm();
    }

    if (getElement("applicationsList")) {
        await renderDashboard();
    }

    if (getElement("myApplicationsList")) {
        await renderMyApplications();
    }

    if (getElement("myJobsList")) {
        await renderMyJobs();
    }
});
