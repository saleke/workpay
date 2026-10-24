import type { ScopingDimensionKey, ScopingOption } from "./types.js";

export interface DomainSlotDefinition {
  slotKey: string;
  dimension: ScopingDimensionKey;
  questionLayman: string;
  questionTechnical: string;
  helperContextLayman: string;
  helperContextTechnical: string;
  options: ScopingOption[];
}

export interface DomainDefinition {
  domainId: string;
  label: string;
  keywords: string[];
  slots: DomainSlotDefinition[];
  defaultMilestones: Array<{
    title: string;
    description: string;
    percentage: number;
    deliverableCheck: string;
  }>;
}

export const DOMAIN_DEFINITIONS: Record<string, DomainDefinition> = {
  // 1. IT, NETWORKING & INFRASTRUCTURE (e.g. "My computer network is slow")
  network_infrastructure: {
    domainId: "network_infrastructure",
    label: "IT, Networking & Systems Infrastructure",
    keywords: [
      "network",
      "slow",
      "wifi",
      "wi-fi",
      "internet",
      "router",
      "switch",
      "vpn",
      "packet loss",
      "latency",
      "bandwidth",
      "dns",
      "firewall",
      "ethernet",
      "lan",
      "vlan",
      "computer network",
    ],
    slots: [
      {
        slotKey: "networkScope",
        dimension: "technicalConstraints",
        questionLayman: "Where is the slowdown or connection issue occurring?",
        questionTechnical: "What network topology and layer is experiencing degradation?",
        helperContextLayman: "This tells your specialist whether the bottleneck is in local Wi-Fi, the router, or cloud connections.",
        helperContextTechnical: "Select physical access layer, edge routing, or tunnel transport.",
        options: [
          {
            id: "opt_net_wifi",
            title: "Local Wi-Fi & Office Coverage Bottleneck",
            bestIf: "Laptops, phones, or workstations suffer weak signal, buffering, or frequent disconnects.",
            developerBuilds: "Wi-Fi channel frequency audit, mesh access point placement plan, and QoS traffic priority rules.",
            tradeOff: "Maximizes speeds on existing internet connection without paying for expensive ISP upgrades.",
            value: "Local Wi-Fi Channel Tuning & Access Point Optimization",
            badge: "Fastest Office Fix",
          },
          {
            id: "opt_net_router",
            title: "Router, Switch & Network Gateway Hardware",
            bestIf: "The entire office or home network slows down when multiple team members are working simultaneously.",
            developerBuilds: "Gateway router firmware update, bufferbloat reduction, gigabit switch routing, and VLAN segmentation.",
            tradeOff: "Eliminates network congestion and protects business-critical traffic.",
            value: "Router Gateway & Managed Switch Architecture",
            badge: "Hardware & Routing",
          },
          {
            id: "opt_net_vpn",
            title: "Remote Team VPN & Cloud Connectivity Latency",
            bestIf: "Remote staff experience sluggish access or timeouts when accessing internal servers and tools.",
            developerBuilds: "High-throughput WireGuard/IPSec VPN server with split-tunneling and MTU optimization.",
            tradeOff: "Provides military-grade encryption with sub-15ms tunnel overhead.",
            value: "WireGuard VPN with Split-Tunneling Routing",
            badge: "Remote Team Security",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we verify the network speed is fixed before releasing payment?",
        questionTechnical: "What benchmark telemetry and packet verification confirms resolution?",
        helperContextLayman: "We run an objective speed and latency test that proves the fix works.",
        helperContextTechnical: "Automated iperf3 throughput benchmark and jitter telemetry.",
        options: [
          {
            id: "opt_val_throughput",
            title: "Automated Throughput Benchmark (>= 300 Mbps, Latency < 20ms)",
            bestIf: "You want mathematical proof of fast, stable speeds across all work areas.",
            developerBuilds: "Automated iperf3 benchmark report measuring local throughput, jitter < 3ms, and zero packet drop.",
            tradeOff: "Unambiguous speed telemetry before and after the configuration changes.",
            value: "Documented iperf3 benchmark proving >= 300 Mbps sustained throughput and zero packet drop",
            badge: "Telemetry Proof",
          },
          {
            id: "opt_val_soak_test",
            title: "24-Hour Network Stability Soak Test with Monitoring Graph",
            bestIf: "You want certainty that the network does not drop during peak business hours.",
            developerBuilds: "24-hour continuous ping and packet monitor graphing uptime and response times under full team load.",
            tradeOff: "Ensures the fix holds permanently over full operational cycles.",
            value: "24-hour network telemetry log showing 99.9%+ uptime and zero dropped sessions",
            badge: "Stability Guarantee",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Network Diagnostics & Topology Mapping",
        description: "Analyze signal interference, packet loss hotspots, and gateway router bottlenecks.",
        percentage: 30,
        deliverableCheck: "Diagnostic telemetry report identifying exact root-cause bottlenecks.",
      },
      {
        title: "Hardware Reconfiguration & Traffic Prioritization",
        description: "Apply channel frequency tuning, QoS rules, switch routing, and firmware upgrades.",
        percentage: 45,
        deliverableCheck: "Configured networking hardware with validated routing rules.",
      },
      {
        title: "Benchmark Verification & Coverage Validation",
        description: "Execute end-to-end throughput tests, document network map, and deliver admin guide.",
        percentage: 25,
        deliverableCheck: "Passing throughput benchmark report and verified zero-drop connectivity.",
      },
    ],
  },

  // 2. CLOUD, DEVOPS & SITE RELIABILITY
  cloud_devops: {
    domainId: "cloud_devops",
    label: "Cloud Architecture, DevOps & Hosting",
    keywords: [
      "devops",
      "cloud",
      "aws",
      "cloudflare",
      "gcp",
      "azure",
      "docker",
      "kubernetes",
      "k8s",
      "ci/cd",
      "pipeline",
      "terraform",
      "hosting",
      "deployment",
      "server",
      "vps",
      "ssl",
      "nginx",
    ],
    slots: [
      {
        slotKey: "cloudEnvironment",
        dimension: "technicalConstraints",
        questionLayman: "Where should your applications and servers be hosted?",
        questionTechnical: "What cloud provider and infrastructure-as-code target applies?",
        helperContextLayman: "Different providers offer different balances of cost, simplicity, and control.",
        helperContextTechnical: "Select target cloud provider and orchestration model.",
        options: [
          {
            id: "opt_cld_serverless",
            title: "Cloudflare & Serverless Edge Platform",
            bestIf: "You want zero server maintenance, instant global CDN, and near-zero idle cost.",
            developerBuilds: "Serverless Workers/Pages deployment with automated custom domain SSL and DDoS protection.",
            tradeOff: "Eliminates server management entirely with instantaneous global edge delivery.",
            value: "Cloudflare Serverless Edge with Global CDN",
            badge: "Zero Server Hassle",
          },
          {
            id: "opt_cld_aws",
            title: "Amazon Web Services (AWS) or Google Cloud",
            bestIf: "You require dedicated virtual servers, managed databases (RDS), or private cloud networking (VPC).",
            developerBuilds: "Terraform / CDK script provisioning EC2/ECS compute, RDS PostgreSQL, and security group firewalls.",
            tradeOff: "Enterprise-grade scalability with complete infrastructure control.",
            value: "AWS Infrastructure with Terraform Automation",
            badge: "Enterprise Standard",
          },
          {
            id: "opt_cld_docker",
            title: "Docker Containerized Setup on Lightweight VPS",
            bestIf: "You want predictable low hosting costs ($10 to $20/month) with full data ownership.",
            developerBuilds: "Docker Compose multi-container stack with automated backups, Nginx reverse proxy, and Let's Encrypt SSL.",
            tradeOff: "Highly cost-effective with zero cloud vendor lock-in.",
            value: "Docker Compose on Linux VPS with Automated Backups",
            badge: "Budget & Portable",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we prove the cloud setup is operational before approving payment?",
        questionTechnical: "What deployment verification and automated health checks confirm completion?",
        helperContextLayman: "An automated deployment test confirming servers and automated updates run without errors.",
        helperContextTechnical: "Automated CI/CD run verifying clean build, migrations, and HTTP 200 healthcheck.",
        options: [
          {
            id: "opt_val_cicd_deploy",
            title: "Automated CI/CD Pipeline Deployment with HTTP 200 Healthcheck",
            bestIf: "You want proof that code commits automatically build, test, and deploy cleanly.",
            developerBuilds: "GitHub Actions workflow running lint, tests, build, and zero-downtime deployment pass.",
            tradeOff: "Future code updates deploy with a single click in under 2 minutes.",
            value: "Automated GitHub Actions CI/CD pipeline deploying live with passing health check",
            badge: "Automated Delivery",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Infrastructure Provisioning & Security Hardening",
        description: "Cloud compute, database clustering, VPC firewalls, and domain DNS setup.",
        percentage: 40,
        deliverableCheck: "Live cloud compute and database instance with secured access keys.",
      },
      {
        title: "Containerization & Application Deployment",
        description: "Docker environment setup, application configuration, and environment secrets management.",
        percentage: 35,
        deliverableCheck: "Application running cleanly on staging domain with SSL certificates active.",
      },
      {
        title: "Automated CI/CD Pipeline & Operational Runbook",
        description: "Continuous integration automation, automated backup schedules, and handoff documentation.",
        percentage: 25,
        deliverableCheck: "Working CI/CD pipeline and disaster recovery runbook delivered.",
      },
    ],
  },

  // 3. API, DATA SYNC & AUTOMATION (e.g. "Sync eBay inventory")
  api_integration: {
    domainId: "api_integration",
    label: "API, Data Sync & Automation",
    keywords: [
      "api",
      "sync",
      "syncing",
      "ebay",
      "amazon",
      "webhook",
      "integration",
      "cron",
      "backend",
      "database",
      "export",
      "import",
      "connector",
      "zapier",
      "n8n",
    ],
    slots: [
      {
        slotKey: "syncFrequency",
        dimension: "technicalConstraints",
        questionLayman: "How frequently does your data need to stay synchronized?",
        questionTechnical: "What sync cadence and webhook ingestion architecture is required?",
        helperContextLayman: "Faster syncs require event-driven webhooks, while daily syncs use scheduled batch jobs.",
        helperContextTechnical: "Select event-driven push architecture or scheduled poll intervals.",
        options: [
          {
            id: "opt_freq_realtime",
            title: "Real-Time (Instant Live Webhooks)",
            bestIf: "Inventory changes quickly and selling out of stock on any channel must be prevented instantly.",
            developerBuilds: "Webhook listener with signature verification, deduplication, and immediate sync queue.",
            tradeOff: "Near zero-latency sync with resilient event retries.",
            value: "Instant Webhook-Driven Synchronization",
            badge: "Zero Stockout Risk",
          },
          {
            id: "opt_freq_hourly",
            title: "Hourly Scheduled Sync",
            bestIf: "Moderate order volume where inventory updates within the hour are completely sufficient.",
            developerBuilds: "Automated background cron worker with rate-limit throttler and batch delta updates.",
            tradeOff: "Very dependable, avoids third-party API rate-limit penalties, and keeps server costs minimal.",
            value: "Hourly Batch Synchronization Worker",
            badge: "Standard & Cost Effective",
          },
          {
            id: "opt_freq_daily",
            title: "Daily Scheduled Reconciliation",
            bestIf: "Catalogs or stock levels only change once a day or during nightly audits.",
            developerBuilds: "Scheduled nightly sync script with full integrity comparison report.",
            tradeOff: "Simplest implementation with detailed overnight audit summaries.",
            value: "Daily Nightly Batch Reconciliation",
            badge: "Lightweight & Budget Friendly",
          },
        ],
      },
      {
        slotKey: "errorHandling",
        dimension: "boundaryConstraints",
        questionLayman: "What should happen if an external service goes offline or returns an error?",
        questionTechnical: "What retry policies, dead-letter queues, and alert thresholds should be built?",
        helperContextLayman: "Ensures no data is lost when external APIs experience downtime.",
        helperContextTechnical: "Select error recovery strategy and operational alerting.",
        options: [
          {
            id: "opt_err_retry_alert",
            title: "Automated Exponential Retries with Instant Email Alert",
            bestIf: "You want the system to fix temporary glitches automatically and only email you if something stays broken.",
            developerBuilds: "3-stage exponential backoff retry queue with detailed alert emails on critical failure.",
            tradeOff: "Self-healing system with high uptime and clear operational visibility.",
            value: "Exponential Backoff Retries with Failure Alerts",
            badge: "Self-Healing Standard",
          },
          {
            id: "opt_err_audit_log",
            title: "Error Log with Failed Item CSV Export",
            bestIf: "You prefer reviewing any skipped records in a clean spreadsheet report.",
            developerBuilds: "Structured failure log file and downloadable failed-items CSV report in admin view.",
            tradeOff: "Clear auditability so non-technical staff can inspect and re-run individual records.",
            value: "Audit Log with Failed Record Export",
            badge: "Auditable & Transparent",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we prove the synchronization works before approving delivery?",
        questionTechnical: "What verification proof confirms correct data mapping and idempotent sync?",
        helperContextLayman: "A verifiable test verifying products updated on source match destination exactly.",
        helperContextTechnical: "Automated test suite and sandbox mutation validation.",
        options: [
          {
            id: "opt_val_roundtrip",
            title: "10-Item Sandbox Test Mutation & Verification Script",
            bestIf: "You want proof that modifying test items updates the remote system with zero mismatches.",
            developerBuilds: "Verification script updating 10 test records and confirming matching quantities on target.",
            tradeOff: "100% mathematical proof of bidirectional accuracy before touching live production.",
            value: "10-item synthetic mutation test verifying zero field discrepancies and idempotent retries",
            badge: "Mathematical Proof",
          },
          {
            id: "opt_val_unit_tests",
            title: "Automated Test Suite with 90%+ Code Coverage",
            bestIf: "Long-term software maintainability and clean engineering are required.",
            developerBuilds: "Suite of automated unit and integration tests mocking all external API endpoints.",
            tradeOff: "Code is verified against network timeouts, bad responses, and schema drifts.",
            value: "Automated test suite executing with exit code 0 and zero unhandled errors",
            badge: "Developer Assurance",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "API Authentication & Data Mapping",
        description: "Secure credential configuration, schema alignment, and initial read connector.",
        percentage: 35,
        deliverableCheck: "Successful authenticated handshake and sample JSON payload read.",
      },
      {
        title: "Synchronization Engine & Retry Pipeline",
        description: "Bidirectional sync worker, queue handling, and failure recovery logic.",
        percentage: 45,
        deliverableCheck: "Live sync job successfully transmitting mutated records with error recovery.",
      },
      {
        title: "Integration Verification & Deployment",
        description: "10-item synthetic mutation run-through and production scheduler deployment.",
        percentage: 20,
        deliverableCheck: "Passing end-to-end verification script with zero unmapped fields.",
      },
    ],
  },

  // 4. DATA ENGINEERING, CLEANING & AI/ML
  data_pipeline: {
    domainId: "data_pipeline",
    label: "Data Cleaning, Transformation & Analysis",
    keywords: [
      "data",
      "csv",
      "clean",
      "dedup",
      "excel",
      "records",
      "transform",
      "normalize",
      "customer list",
      "deduplication",
      "etl",
      "analytics",
      "sql",
      "pipeline",
    ],
    slots: [
      {
        slotKey: "cleaningRules",
        dimension: "technicalConstraints",
        questionLayman: "What specific clean-up rules should be applied to your records?",
        questionTechnical: "What data normalization, deduplication heuristics, and validation rules apply?",
        helperContextLayman: "Your specialist will write precise automated rules so no good data is deleted.",
        helperContextTechnical: "Select validation rules for IDs, emails, phone numbers, and duplicate detection.",
        options: [
          {
            id: "opt_clean_strict_dedup",
            title: "Strict Deduplication by Email / Phone + Normalization",
            bestIf: "Customer duplicates cost you money or cause duplicate marketing messages.",
            developerBuilds: "Automated normalization script standardizing phone formats, lowercasing emails, and merging identical accounts.",
            tradeOff: "Reduces duplicate entries below 0.5% while preserving historical customer IDs.",
            value: "Strict Key Deduplication with Format Normalization",
            badge: "High Precision",
          },
          {
            id: "opt_clean_fuzzy",
            title: "Fuzzy Name and Address Matching",
            bestIf: "Entries have slight typos (e.g. 'St.' vs 'Street' or 'Jon' vs 'John').",
            developerBuilds: "Levenshtein distance algorithm flagging likely duplicates with a match confidence score.",
            tradeOff: "Catches human spelling mistakes that strict matching would miss.",
            value: "Fuzzy Matching with Confidence Scoring",
            badge: "Intelligent Matching",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should completion of the data cleaning be proven?",
        questionTechnical: "What verification checks and audit reports prove data integrity?",
        helperContextLayman: "A verifiable summary report showing exact counts before and after.",
        helperContextTechnical: "Integrity audit report confirming zero record loss and deterministic validation pass.",
        options: [
          {
            id: "opt_val_audit_report",
            title: "Automated Integrity Audit Report & Clean CSV Download",
            bestIf: "You need concrete statistics proving every row was accounted for.",
            developerBuilds: "Validation script verifying: total rows before, rows merged, rows cleaned, and 0% formatting errors.",
            tradeOff: "Transparent mathematical proof of accuracy.",
            value: "Clean CSV file plus automated validation report confirming zero duplicate keys and 100% valid formats",
            badge: "Mathematical Integrity",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Data Profiling & Sample Rule Validation",
        description: "Analyze raw data anomalies, structure clean-up script, and test on 100 sample records.",
        percentage: 30,
        deliverableCheck: "Sample clean output and agreed validation rule definitions.",
      },
      {
        title: "Full-Scale Batch Transformation & Deduplication",
        description: "Execute normalization and deduplication across the complete dataset.",
        percentage: 50,
        deliverableCheck: "Processed full dataset with preliminary anomaly log.",
      },
      {
        title: "Final Integrity Audit & Verified Delivery",
        description: "Run automated validation assertions and deliver normalized production file.",
        percentage: 20,
        deliverableCheck: "Validated clean dataset passing all assertions with zero duplicate entries.",
      },
    ],
  },

  // 5. CYBERSECURITY & COMPLIANCE
  cybersecurity: {
    domainId: "cybersecurity",
    label: "Cybersecurity, Audit & Compliance",
    keywords: [
      "security",
      "audit",
      "pentest",
      "penetration",
      "penetration test",
      "penetration testing",
      "security audit",
      "security assessment",
      "vulnerability assessment",
      "vulnerability",
      "soc2",
      "compliance",
      "harden",
      "encryption",
      "gdpr",
      "hipaa",
      "exploit",
    ],
    slots: [
      {
        slotKey: "securityTarget",
        dimension: "technicalConstraints",
        questionLayman: "What system, website, or infrastructure needs security inspection?",
        questionTechnical: "What attack surface and compliance standard defines the audit scope?",
        helperContextLayman: "Identifies whether we are testing website logins, servers, or cloud accounts.",
        helperContextTechnical: "Select OWASP application testing, cloud posture, or smart contract scope.",
        options: [
          {
            id: "opt_sec_webapp",
            title: "Web Application & API Penetration Test",
            bestIf: "You have a live web app and need to ensure hackers cannot steal data or bypass logins.",
            developerBuilds: "Systematic penetration test against OWASP Top 10 vulnerabilities (SQL injection, XSS, auth bypass).",
            tradeOff: "Uncovers exploitable security holes before malicious actors find them.",
            value: "Web Application & API Penetration Audit",
            badge: "Application Defense",
          },
          {
            id: "opt_sec_cloud",
            title: "Cloud Infrastructure & IAM Security Audit",
            bestIf: "Your team uses AWS, Google Cloud, or Azure and needs to verify proper permissions and firewalls.",
            developerBuilds: "Automated cloud security audit checking open ports, exposed storage buckets, and privileged access keys.",
            tradeOff: "Prevents accidental data leaks and cloud account compromises.",
            value: "Cloud Infrastructure & Access IAM Hardening",
            badge: "Infrastructure Hardening",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should the security specialist prove all issues are resolved?",
        questionTechnical: "What verification proof and remediation report confirms security posture?",
        helperContextLayman: "A verified report showing each vulnerability found and re-tested as fixed.",
        helperContextTechnical: "Detailed vulnerability assessment with verified re-test proof.",
        options: [
          {
            id: "opt_val_retest_report",
            title: "Executive Vulnerability Report with Verified Re-Test Pass",
            bestIf: "You need documentation for clients, investors, or compliance auditors.",
            developerBuilds: "Executive report detailing CVSS scores, proof-of-concept exploits, code patches, and clean re-test pass.",
            tradeOff: "Auditable third-party proof of security compliance.",
            value: "Formal vulnerability report with zero unresolved critical or high severity findings upon re-test",
            badge: "Certified Audit",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Reconnaissance & Vulnerability Scanning",
        description: "Map exposed attack surface, automated vulnerability scanning, and manual discovery.",
        percentage: 35,
        deliverableCheck: "Initial findings summary and prioritized vulnerability inventory.",
      },
      {
        title: "Deep Exploitation Analysis & Code Patch Guidance",
        description: "Validate exploitable pathways and provide precise remediation code snippets.",
        percentage: 40,
        deliverableCheck: "Remediation guide with specific configuration and code patches.",
      },
      {
        title: "Remediation Verification & Final Compliance Report",
        description: "Re-test all identified vulnerabilities and issue signed verification report.",
        percentage: 25,
        deliverableCheck: "Final signed report confirming zero critical or high vulnerabilities remaining.",
      },
    ],
  },

  // 6. E-COMMERCE & STOREFRONT (e.g. "Sell homemade pastries locally")
  ecommerce: {
    domainId: "ecommerce",
    label: "E-Commerce & Storefront",
    keywords: [
      "store",
      "ecommerce",
      "e-commerce",
      "shopify",
      "sell",
      "pastries",
      "bakery",
      "products",
      "cart",
      "checkout",
      "merchandise",
      "shop",
    ],
    slots: [
      {
        slotKey: "inventorySource",
        dimension: "technicalConstraints",
        questionLayman: "Where are your products and prices currently kept?",
        questionTechnical: "What inventory backend or catalog architecture should be targeted?",
        helperContextLayman: "Your specialist needs to connect your catalog to the storefront.",
        helperContextTechnical: "Select catalog source and SKU reconciliation model.",
        options: [
          {
            id: "opt_inv_shopify",
            title: "Shopify or Existing Commerce Platform",
            bestIf: "You already have a Shopify, Square, or WooCommerce store and want to build on it.",
            developerBuilds: "Storefront theme configuration, Storefront API connection, and checkout routing.",
            tradeOff: "Fastest turnaround with zero server maintenance required.",
            value: "Shopify / Hosted Storefront API",
            badge: "Fastest & Low Overhead",
          },
          {
            id: "opt_inv_sheets",
            title: "Spreadsheet or CSV File (Google Sheets / Excel)",
            bestIf: "You manage inventory manually in spreadsheets and want an easy, code-free catalog.",
            developerBuilds: "Automated spreadsheet synchronizer with image asset hosting.",
            tradeOff: "Super easy for non-technical store owners to edit prices anytime.",
            value: "Google Sheets / Airtable Database",
            badge: "Simple & Friendly",
          },
          {
            id: "opt_inv_custom_db",
            title: "Dedicated Database & Custom Admin Dashboard",
            bestIf: "You need custom product attributes, bulk variants, and high-volume scalability.",
            developerBuilds: "PostgreSQL database schema, admin inventory manager, and media CDN.",
            tradeOff: "Maximum flexibility with full ownership of data.",
            value: "PostgreSQL Database with Custom Admin CMS",
            badge: "High Scale & Tailored",
          },
        ],
      },
      {
        slotKey: "fulfillmentModel",
        dimension: "boundaryConstraints",
        questionLayman: "How will your customers receive their orders?",
        questionTechnical: "What fulfillment pipeline and logistics boundaries should be integrated?",
        helperContextLayman: "This determines whether your developer needs mapping, booking, or shipping carrier tools.",
        helperContextTechnical: "Select shipping provider integration or local pickup scheduler.",
        options: [
          {
            id: "opt_ful_pickup",
            title: "Storefront Pickup & Scheduled Collection",
            bestIf: "Customers visit your physical shop or kitchen during specific hours.",
            developerBuilds: "Calendar slot picker at checkout with customer pickup confirmation tickets.",
            tradeOff: "Eliminates shipping logistics completely while preventing in-store rushes.",
            value: "Storefront Pickup with Time Slot Booking",
            badge: "Local Business Favorite",
          },
          {
            id: "opt_ful_radius",
            title: "Local Delivery Within City Radius",
            bestIf: "You drop orders off locally or use a local courier service.",
            developerBuilds: "Google Maps radius validator and neighborhood delivery zone pricing.",
            tradeOff: "Keeps delivery localized with precise mileage cutoff limits.",
            value: "Radius-Based Local Delivery System",
            badge: "High Conversion",
          },
          {
            id: "opt_ful_shipping",
            title: "Nationwide Shipping with Live Carrier Rates",
            bestIf: "Your goods are non-perishable and ship in standard postal boxes.",
            developerBuilds: "Carrier API integration (FedEx, UPS, USPS) with live rates and label generator.",
            tradeOff: "Automates real-time box weight calculation across shipping zones.",
            value: "Carrier Rate Calculator (FedEx/UPS/USPS)",
            badge: "National Reach",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we verify the store works before releasing final payment?",
        questionTechnical: "What automated test harness and observable acceptance proof confirms delivery?",
        helperContextLayman: "We create a clear, third-party test that you and your specialist can both run.",
        helperContextTechnical: "Objective sandbox transaction and performance benchmarks.",
        options: [
          {
            id: "opt_val_sandbox_order",
            title: "End-to-End Test Card Order & Email Receipt",
            bestIf: "You want 100% certainty that real customers can buy and receive orders smoothly.",
            developerBuilds: "Sandbox payment flow processing a real test order with confirmation email dispatch.",
            tradeOff: "Clear black-box proof that the entire buying journey operates without errors.",
            value: "Successful test order in sandbox with customer receipt and admin notification",
            badge: "Gold Standard Proof",
          },
          {
            id: "opt_val_lighthouse_speed",
            title: "Speed Benchmark & Mobile Usability Score",
            bestIf: "Mobile shopping speed and search engine rankings are top priorities.",
            developerBuilds: "Google Lighthouse audit passing mobile performance >= 85 and zero console bugs.",
            tradeOff: "Guarantees blazing fast load times on smartphones and cellular networks.",
            value: "Google Lighthouse Mobile Performance score >= 85 with 100% responsive layout",
            badge: "Performance Guarantee",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Catalog Architecture & Checkout Setup",
        description: "Storefront UI, inventory data source connection, and payment gateway configuration.",
        percentage: 40,
        deliverableCheck: "Working staging storefront with product catalog and cart interface.",
      },
      {
        title: "Fulfillment Logic & Notification System",
        description: "Delivery/pickup routing rules, order management, and customer notification dispatch.",
        percentage: 35,
        deliverableCheck: "Configured fulfillment options and automated order confirmation flow.",
      },
      {
        title: "Verification Testing & Production Launch",
        description: "Complete sandbox purchase run-through, speed optimization, and production deployment.",
        percentage: 25,
        deliverableCheck: "Passing end-to-end sandbox test purchase and live domain launch.",
      },
    ],
  },

  // 7. MOBILE APPLICATION (iOS & Android)
  mobile_app: {
    domainId: "mobile_app",
    label: "Mobile Application (iOS & Android)",
    keywords: [
      "mobile",
      "app",
      "ios",
      "android",
      "iphone",
      "react native",
      "flutter",
      "expo",
      "play store",
      "app store",
    ],
    slots: [
      {
        slotKey: "platformTarget",
        dimension: "technicalConstraints",
        questionLayman: "Which smartphone devices should your app run on?",
        questionTechnical: "What framework and deployment targets are needed?",
        helperContextLayman: "Cross-platform technology lets one codebase power both Apple and Android phones.",
        helperContextTechnical: "Target cross-platform framework or native stacks.",
        options: [
          {
            id: "opt_mob_cross",
            title: "Cross-Platform (Both iPhone and Android)",
            bestIf: "You want your app accessible to all customers regardless of what phone they carry.",
            developerBuilds: "Modern cross-platform app (React Native / Expo) compiled for iOS and Android.",
            tradeOff: "One unified codebase saves 40% on build and maintenance costs.",
            value: "React Native / Expo Cross-Platform Codebase",
            badge: "Recommended Standard",
          },
          {
            id: "opt_mob_ios_only",
            title: "iPhone / iOS Dedicated First",
            bestIf: "Your target audience is exclusively on Apple devices or you want to launch quickly.",
            developerBuilds: "Optimized iOS build tested on recent iPhone screen resolutions.",
            tradeOff: "Faster initial launch with focused UI attention.",
            value: "iOS Focused Mobile Application",
            badge: "Focused & Swift",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we verify the mobile app works before releasing funds?",
        questionTechnical: "What test builds and smoke test workflows validate completion?",
        helperContextLayman: "You or a reviewer will install a test version directly onto a phone.",
        helperContextTechnical: "TestFlight / Expo preview build with end-to-end checkout pass.",
        options: [
          {
            id: "opt_val_testflight",
            title: "Interactive TestFlight / Expo Preview on Physical Phone",
            bestIf: "You want to physically tap, scroll, and test the app on your own device.",
            developerBuilds: "QR code invite link allowing one-tap installation on test devices without app store delays.",
            tradeOff: "Hands-on proof that performance feels snappy and gestures work perfectly.",
            value: "Interactive test build installable via TestFlight or Expo with functional auth and core flows",
            badge: "Hands-On Device Proof",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "App Shell, Navigation & Screen Layouts",
        description: "Mobile architecture, typography, brand assets, and interactive screens.",
        percentage: 40,
        deliverableCheck: "Functional mobile navigation and responsive layout screens.",
      },
      {
        title: "Data Integration & Core Functional Workflows",
        description: "API connection, authentication, and core interactive feature workflows.",
        percentage: 40,
        deliverableCheck: "Connected workflows allowing real data creation and user interactions.",
      },
      {
        title: "Test Build Distribution & Quality Audit",
        description: "Device smoke testing, bug fixes, and deployable preview build link.",
        percentage: 20,
        deliverableCheck: "Test build installable on physical device passing all acceptance criteria.",
      },
    ],
  },

  // 8. WEB APPLICATION & CLIENT PORTAL
  web_platform: {
    domainId: "web_platform",
    label: "Web Application & Client Portal",
    keywords: [
      "website",
      "web application",
      "webapp",
      "portal",
      "client portal",
      "dashboard",
      "platform",
      "saas",
      "nextjs",
      "react",
      "tailwind",
      "frontend",
      "user dashboard",
    ],
    slots: [
      {
        slotKey: "authAndAccess",
        dimension: "technicalConstraints",
        questionLayman: "How should users sign in to their accounts?",
        questionTechnical: "What authentication and session management architecture should be used?",
        helperContextLayman: "Choose between passwordless email codes, social logins, or classic accounts.",
        helperContextTechnical: "Select auth provider and credential handling strategy.",
        options: [
          {
            id: "opt_auth_social",
            title: "1-Click Social Sign-In (Google / GitHub) + Email",
            bestIf: "You want the highest sign-up conversion with zero friction for visitors.",
            developerBuilds: "OAuth 2.0 flow with Google and GitHub buttons plus secure email magic links.",
            tradeOff: "Users sign in in 2 seconds without forgetting passwords.",
            value: "Social OAuth 2.0 (Google/GitHub) and Magic Links",
            badge: "Highest Conversion",
          },
          {
            id: "opt_auth_classic",
            title: "Standard Email and Password with Reset Flow",
            bestIf: "Traditional enterprise or business customers who prefer corporate passwords.",
            developerBuilds: "Argon2/bcrypt password hashing, CSRF session cookies, and forgot-password reset flow.",
            tradeOff: "Familiar enterprise pattern with self-service password recovery.",
            value: "Secure Email/Password with Automated Recovery",
            badge: "Enterprise Classic",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we verify the web application is complete?",
        questionTechnical: "What verifiable test suite and staging deployment confirms delivery?",
        helperContextLayman: "A live URL where all key user actions work without bugs.",
        helperContextTechnical: "Live staging URL with verified core flows and zero console errors.",
        options: [
          {
            id: "opt_val_staging_flows",
            title: "Live Staging URL with Verified User Journey",
            bestIf: "You want to click through the live web app on your browser.",
            developerBuilds: "Working deployment on a preview domain with zero critical console errors.",
            tradeOff: "Direct visible proof on real web infrastructure.",
            value: "Live staging preview with authenticated session creation and zero console runtime errors",
            badge: "Live Web Verification",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Interface Foundation & User Authentication",
        description: "Responsive design system, navigation bar, and secure user account sign-in.",
        percentage: 35,
        deliverableCheck: "Functional auth flow and responsive dashboard wireframes.",
      },
      {
        title: "Core Platform Functionality & Database",
        description: "Data models, primary feature workflows, and backend API routes.",
        percentage: 45,
        deliverableCheck: "Live interactive features allowing data persistence and user operations.",
      },
      {
        title: "Quality Review, Speed Optimization & Launch",
        description: "Cross-browser testing, mobile responsiveness, and production hosting deployment.",
        percentage: 20,
        deliverableCheck: "Live production deployment passing performance audit with zero errors.",
      },
    ],
  },

  // 9. AUTOMATION, WEB SCRAPING & SCRIPTING
  automation_scripts: {
    domainId: "automation_scripts",
    label: "Automation, Web Scraping & Scripting",
    keywords: [
      "automation",
      "automate",
      "script",
      "scripts",
      "scrape",
      "scraping",
      "scraper",
      "web scraping",
      "crawler",
      "crawl",
      "bot",
      "playwright",
      "puppeteer",
      "selenium",
      "scheduled task",
      "batch job",
      "python script",
      "data extraction",
      "extract data",
    ],
    slots: [
      {
        slotKey: "automationArchitecture",
        dimension: "technicalConstraints",
        questionLayman: "What kind of workflow or task needs to be automated?",
        questionTechnical: "What automation runner architecture and target surface applies?",
        helperContextLayman: "Choose between web scraping, background data jobs, or scheduled workflows.",
        helperContextTechnical: "Select headless browser execution, HTTP API polling, or workflow orchestration.",
        options: [
          {
            id: "opt_auto_browser",
            title: "Headless Browser Automation (Playwright / Puppeteer)",
            bestIf: "Target website requires JavaScript rendering, clicks, navigation, or login handling.",
            developerBuilds: "Headless browser script with resilient element selectors, proxy rotation, and captcha handling.",
            tradeOff: "Navigates complex interactive websites reliably at the cost of higher memory usage.",
            value: "Playwright Headless Automation with Proxy Rotation",
            badge: "Deep Web Automation",
          },
          {
            id: "opt_auto_api_worker",
            title: "Lightweight API & HTTP Request Worker",
            bestIf: "Data or tasks can be queried directly via HTTP endpoints or RSS/JSON feeds.",
            developerBuilds: "Asynchronous Python/Node script with rate throttling and structured JSON/CSV export.",
            tradeOff: "Extremely fast execution with near-zero compute overhead.",
            value: "Async HTTP Worker with Rate-Limit Throttling",
            badge: "Fast & Lightweight",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should completion of the automation script be proven?",
        questionTechnical: "What test harness and output validation verifies correct script execution?",
        helperContextLayman: "An observable test run demonstrating successful output without crashes.",
        helperContextTechnical: "Automated dry run and output schema validation.",
        options: [
          {
            id: "opt_val_auto_sample_run",
            title: "Live Execution Run with Clean Output Artifact (JSON / CSV)",
            bestIf: "You want direct proof of clean, formatted data generated without errors.",
            developerBuilds: "Live script execution log accompanied by 100% schema-compliant output file.",
            tradeOff: "Direct tangible verification that the script extracts and formats data accurately.",
            value: "Live sample execution run producing valid output artifact with exit code 0",
            badge: "Execution Proof",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Target Surface Analysis & Prototype Script",
        description: "Inspect selectors/APIs, configure authentication, and extract sample payload.",
        percentage: 35,
        deliverableCheck: "Working prototype script extracting sample records with zero errors.",
      },
      {
        title: "Full Automation Pipeline & Error Recovery",
        description: "Implement pagination, rate throttling, retry logic, and structured export formatting.",
        percentage: 45,
        deliverableCheck: "Complete automation script with error handling and logging.",
      },
      {
        title: "Execution Verification & Operational Handoff",
        description: "Verify end-to-end execution, deliver setup README, and configure scheduler if required.",
        percentage: 20,
        deliverableCheck: "Passing verification run and complete setup documentation.",
      },
    ],
  },

  // 10. CUSTOM SOFTWARE & BACKEND ENGINEERING
  custom_software: {
    domainId: "custom_software",
    label: "Custom Software & Backend Engineering",
    keywords: [
      "software",
      "backend",
      "microservice",
      "algorithm",
      "cli",
      "library",
      "sdk",
      "c++",
      "rust",
      "golang",
      "java",
      "backend service",
      "logic",
      "engine",
    ],
    slots: [
      {
        slotKey: "softwareArchitecture",
        dimension: "technicalConstraints",
        questionLayman: "What form should your software application take?",
        questionTechnical: "What runtime architecture and packaging format is required?",
        helperContextLayman: "Specifies whether this is a standalone tool, background service, or reusable library.",
        helperContextTechnical: "Select microservice daemon, CLI executable, or language library.",
        options: [
          {
            id: "opt_soft_service",
            title: "Microservice / Background Daemon Service",
            bestIf: "You need a service running continuously to handle tasks, events, or calculations.",
            developerBuilds: "Containerized service with healthcheck endpoint, graceful shutdown, and structured logging.",
            tradeOff: "Reliable background execution with clear operational telemetry.",
            value: "Containerized Background Microservice",
            badge: "Daemon Service",
          },
          {
            id: "opt_soft_cli",
            title: "Command-Line Tool (CLI) with Argument Parser",
            bestIf: "Team members will run this command on developer or server terminals.",
            developerBuilds: "Executable binary or script with help flags, interactive prompts, and formatted terminal output.",
            tradeOff: "Fast terminal utility with zero web server dependencies.",
            value: "Cross-Platform Command-Line Executable",
            badge: "Terminal Utility",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should we verify the custom software is built correctly?",
        questionTechnical: "What test harness and acceptance assertions confirm completion?",
        helperContextLayman: "An automated suite of tests proving the code handles edge cases and runs without errors.",
        helperContextTechnical: "Unit and integration test suite passing with high code coverage.",
        options: [
          {
            id: "opt_val_test_suite",
            title: "Automated Unit & Integration Test Suite (Code Coverage >= 85%)",
            bestIf: "You want mathematically verifiable assurance that all logic pathways work.",
            developerBuilds: "Comprehensive test suite covering edge cases, invalid inputs, and error recovery.",
            tradeOff: "Definitive regression proof protecting future updates.",
            value: "Automated test suite passing with exit code 0 and code coverage >= 85%",
            badge: "Code Coverage Proof",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Architecture Design & Core Interfaces",
        description: "Define data types, modular interfaces, and technical specification.",
        percentage: 30,
        deliverableCheck: "Documented interface definitions and project skeleton.",
      },
      {
        title: "Core Logic Implementation & Edge Case Handling",
        description: "Implement primary business algorithms, data persistence, and error handling.",
        percentage: 50,
        deliverableCheck: "Functional software engine handling standard and edge-case inputs.",
      },
      {
        title: "Test Suite Pass, Packaging & Documentation",
        description: "Finalize test assertions, build distribution package, and write developer docs.",
        percentage: 20,
        deliverableCheck: "Passing test suite with >= 85% coverage and complete documentation.",
      },
    ],
  },

  // 11. GENERAL PROJECT & CUSTOM SERVICES (Universal Fallback)
  general_project: {
    domainId: "general_project",
    label: "Custom Technical & Professional Services",
    keywords: [
      "consulting",
      "project",
      "deliverable",
      "task",
      "setup",
      "custom",
      "implementation",
      "fix",
      "analysis",
      "review",
    ],
    slots: [
      {
        slotKey: "deliverableFormat",
        dimension: "technicalConstraints",
        questionLayman: "In what format should your final project deliverable be provided?",
        questionTechnical: "What primary deliverable format and packaging structure is required?",
        helperContextLayman: "Clarifies whether your specialist delivers code, configured systems, or documentation.",
        helperContextTechnical: "Select primary technical delivery mechanism.",
        options: [
          {
            id: "opt_gen_code",
            title: "Source Code Repository with Implementation Guide",
            bestIf: "You need custom technical assets, scripts, or application code delivered.",
            developerBuilds: "Clean, documented source code repository with installation instructions and test proof.",
            tradeOff: "Provides full ownership of custom technical assets.",
            value: "Source Code Repository with Implementation Documentation",
            badge: "Source Code Asset",
          },
          {
            id: "opt_gen_config",
            title: "Configured Live System or Service Setup",
            bestIf: "You need an existing platform, tool, or service configured and verified for your workflow.",
            developerBuilds: "Hands-on configuration, credentials setup, and verified operational workflow.",
            tradeOff: "Immediate operational readiness with minimal client technical overhead.",
            value: "Configured Platform Instance with Operational Validation",
            badge: "Operational Setup",
          },
          {
            id: "opt_gen_report",
            title: "Comprehensive Technical Audit & Actionable Report",
            bestIf: "You need expert evaluation, architecture review, or strategic roadmap documentation.",
            developerBuilds: "Structured assessment document with findings, diagrams, and concrete recommendations.",
            tradeOff: "High-clarity executive insights and technical roadmap.",
            value: "Formal Technical Assessment Report & Implementation Plan",
            badge: "Strategic Advisory",
          },
        ],
      },
      {
        slotKey: "validationProof",
        dimension: "validationProof",
        questionLayman: "How should completion of the project be objectively verified?",
        questionTechnical: "What verifiable criteria or demonstration confirms milestone completion?",
        helperContextLayman: "A clear demonstration or checklist agreed upon before work begins.",
        helperContextTechnical: "Select verifiable acceptance proof method.",
        options: [
          {
            id: "opt_val_checklist",
            title: "Interactive Demonstration & Acceptance Criteria Checklist",
            bestIf: "You want a live walkthrough demonstrating all agreed deliverables meet specifications.",
            developerBuilds: "Step-by-step verification walkthrough demonstrating each item on the agreed acceptance checklist.",
            tradeOff: "Direct human verifiable assurance before releasing payment authorization.",
            value: "Live demonstration walkthrough verifying 100% of agreed acceptance checklist items",
            badge: "Verified Walkthrough",
          },
          {
            id: "opt_val_deliverable_audit",
            title: "Documented Delivery Review with Signed Handoff",
            bestIf: "Deliverables are files, reports, or configs that can be formally reviewed and audited.",
            developerBuilds: "Delivery package containing all agreed artifacts with validation summary.",
            tradeOff: "Clear audit trail with formal verification documentation.",
            value: "Complete delivery artifact package passing formal specification review",
            badge: "Audited Delivery",
          },
        ],
      },
    ],
    defaultMilestones: [
      {
        title: "Requirements Scoping & Technical Architecture",
        description: "Align on exact requirements, review existing context, and deliver project blueprint.",
        percentage: 30,
        deliverableCheck: "Approved technical blueprint and confirmed execution plan.",
      },
      {
        title: "Core Execution & Asset Development",
        description: "Execute primary technical implementation or produce agreed deliverables.",
        percentage: 45,
        deliverableCheck: "Draft deliverables ready for preliminary review and testing.",
      },
      {
        title: "Quality Verification & Operational Handoff",
        description: "Validate deliverables against acceptance criteria, apply revisions, and deliver handoff package.",
        percentage: 25,
        deliverableCheck: "Final verified deliverables passing all agreed acceptance checks.",
      },
    ],
  },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Get the best-matching domain definition from raw user text */
export function matchDomain(rawText: string): DomainDefinition {
  const lower = rawText.toLowerCase();
  let bestMatch: DomainDefinition = DOMAIN_DEFINITIONS.general_project || DOMAIN_DEFINITIONS.web_platform!;
  let highestScore = 0;

  for (const def of Object.values(DOMAIN_DEFINITIONS)) {
    if (def.domainId === "general_project") continue;
    let score = 0;
    for (const kw of def.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower.includes(" ") || kwLower.includes("-") || kwLower.includes("/")) {
        if (lower.includes(kwLower)) {
          score += 5; // High-precision multi-word phrase match
        }
      } else {
        const escaped = escapeRegex(kwLower);
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        if (regex.test(lower)) {
          score += kwLower.length >= 6 ? 3 : 2;
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = def;
    }
  }

  return bestMatch;
}
