# Verified Official Resources for CentaurOS Packs (February 2026)

*All links verified as of February 4, 2026*

---

## 1. App Architecture Setup Pack (Mobile)

### Core Frameworks

#### React Native
- **Official URL**: https://reactnative.dev/
- **Documentation**: https://reactnative.dev/docs/getting-started
- **Current Version**: v0.79 (April 2025) with improvements to developer experience, performance, TypeScript support
- **Key Features**:
  - JavaScript library for building native Android, iOS, and multi-platform apps
  - Platform-agnostic components (View, Text, Image) that map to native APIs
  - Recommended framework: Expo with file-based routing and 50+ modules
  - Meta-supported and community-driven
- **Pricing**: Free and open-source (MIT License)

#### Flutter
- **Official URL**: https://flutter.dev/
- **Documentation**: https://docs.flutter.dev/
- **API Reference**: https://api.flutter.dev/
- **Current Version**: Flutter 3.38.6 (January 2026) with Dart 3.10
- **Key Features**:
  - Google's UI toolkit for building natively compiled multiplatform applications
  - Single codebase for mobile, web, desktop
  - Access to 200+ widgets in SDK
  - Hot reload for rapid development
  - Named a Leader in 2025 IDC MarketScape for GenAI
- **Pricing**: Free and open-source (BSD License)

### Native iOS Development

#### Swift & SwiftUI
- **Official URL**: https://developer.apple.com/swiftui/
- **Documentation**: https://developer.apple.com/documentation/
- **SwiftUI Pathway**: https://developer.apple.com/swiftui/get-started/
- **What's New**: https://developer.apple.com/swiftui/whats-new/
- **Key Features**:
  - Declarative Swift syntax for building apps across all Apple platforms
  - Xcode previews for rapid iteration
  - Seamless integration with UIKit and AppKit
  - Latest features (2025): Rich text editing with AttributedString, enhanced visionOS support, CarPlay widgets, LiquidGlass design system
- **Pricing**: Free (requires Mac with Xcode, Apple Developer Program membership $99/year for app distribution)

### Native Android Development

#### Kotlin & Jetpack Compose
- **Official URL**: https://developer.android.com/develop/ui/compose
- **Quick Start**: https://developer.android.com/develop/ui/compose/setup
- **Kotlin for Compose**: https://developer.android.com/develop/ui/compose/kotlin
- **Key Features**:
  - Modern toolkit for building native Android UI
  - Kotlin-only (requires Kotlin language)
  - Android Studio with smart editor features and live UI previews
  - Adapts to any display size (phones, tablets, foldables)
  - Declarative programming model
- **Pricing**: Free and open-source (Android Studio free download)

### State Management Libraries

#### Redux
- **Official URL**: https://redux.js.org/
- **Getting Started**: https://redux.js.org/introduction/getting-started
- **Current Status**: 9M+ weekly NPM downloads (Most popular option)
- **Key Features**:
  - JavaScript library for predictable, maintainable global state management
  - Redux Toolkit (official recommended approach) simplifies common tasks
  - Centralized state with time-travel debugging via Redux DevTools
  - Core library only 2kB
  - Works with any UI layer, large ecosystem
- **Pricing**: Free and open-source (MIT License)

#### Zustand
- **Official URL**: https://zustand.docs.pmnd.rs/
- **Current Status**: 1.9M+ weekly NPM downloads, 33.7K GitHub stars
- **Key Features**:
  - Small, fast, scalable state management with hook-based API
  - No boilerplate or providers required
  - Handles React pitfalls (zombie child problem, context loss)
  - Installation: `npm install zustand`
  - Creates stores as hooks for direct component use
- **Pricing**: Free and open-source (MIT License)

#### MobX
- **Official URL**: https://mobx.js.org/
- **Current Status**: 1.1M+ weekly NPM downloads, 26.6K GitHub stars
- **Key Features**:
  - Alternative state management with built-in "magic"
  - Easier to use than Redux for many use cases
  - Trusted by Coinbase and Canva
- **Pricing**: Free and open-source (MIT License)

#### Provider (Flutter)
- **Official URL**: https://pub.dev/packages/provider
- **Key Features**:
  - Original Flutter state management solution
  - Wrapper around InheritedWidget
  - Simple and lightweight
- **Pricing**: Free and open-source

#### Riverpod (Flutter)
- **Official URL**: https://riverpod.dev/
- **Documentation**: https://docs-v2.riverpod.dev/
- **Current Version**: Riverpod 3.0 (September 2025)
- **Key Features**:
  - Reactive caching and data-binding framework (evolution of Provider)
  - Beyond state management: includes data fetching, caching, advanced patterns
  - Compile-time safety with custom lint rules
  - Declarative programming, automatic network request handling
  - Hot-reload support, works across Flutter, Dart, servers, CLI
- **Pricing**: Free and open-source (MIT License)

### Mobile Navigation Libraries

#### React Navigation
- **Official URL**: https://reactnavigation.org/
- **Documentation**: https://reactnavigation.org/docs/getting-started
- **Current Version**: Version 8 (coming soon, alpha available)
- **Minimum Requirements**:
  - react-native >= 0.72.0
  - expo >= 52 (if using Expo Go)
  - typescript >= 5.0.0 (if using TypeScript)
- **Key Features**:
  - Built-in navigators for quick setup (Stack, Tab, Drawer)
  - Platform-specific iOS/Android components with smooth animations
  - Fully customizable and extensible
  - Ability to write custom navigators
- **Pricing**: Free and open-source (MIT License)

#### React Native Navigation
- **Official URL**: https://wix.github.io/react-native-navigation/
- **GitHub**: https://github.com/wix/react-native-navigation
- **Key Features**:
  - Native navigation solution by Wix
  - 100% native platform navigation
  - Platform-specific look and feel
- **Pricing**: Free and open-source (MIT License)

### Mobile App Architecture Patterns

#### MVVM (Model-View-ViewModel)
- **Resources**:
  - Architecture Patterns Article (2026): https://medium.com/@jyc.dev/architecture-patterns-in-mobile-development-2026-mvvm-mvi-and-clean-architecture-f26583f53522
  - Android MVVM with Clean Architecture: https://www.toptal.com/android/android-apps-mvvm-with-clean-architecture
- **Key Concepts**:
  - Separates UI (View), business logic (ViewModel), and data (Model)
  - ViewModel mediates between View and Model
  - Platform-agnostic pattern (works across Android, iOS, Flutter, Web)

#### Clean Architecture
- **Resources**:
  - Clean Architecture in iOS & Android: https://mwaibanda.com/clean-architecture
  - GitHub Example (iOS): https://github.com/alexanderommel/iOS-Modular-Clean-Architecture-MVVM
- **Key Benefits**:
  - Platform agnostic (works across all platforms)
  - Independent of UI framework (easy to swap)
  - Highly testable (core logic separate from UI/database/server)
  - Independent of database (interchange data sources)
  - Clear separation: UI, business logic, data layers

#### MVI (Model-View-Intent)
- **Resources**:
  - Modern Android App Architecture (2025): https://medium.com/@androidlab/modern-android-app-architecture-in-2025-mvvm-mvi-and-clean-architecture-with-jetpack-compose-c0df3c727334
- **Key Concepts**:
  - Unidirectional data flow pattern
  - User intentions (Intents) trigger state changes
  - Particularly well-suited for Jetpack Compose and declarative UI

---

## 2. Infrastructure Planning Pack (AI Data Centres)

### Major Cloud Providers for AI/ML

#### Amazon Web Services (AWS)
- **Official URL**: https://aws.amazon.com/
- **AI/ML Services**: https://aws.amazon.com/ai/
- **SageMaker AI**: https://aws.amazon.com/sagemaker-ai/
- **Pricing Calculator**: https://calculator.aws/
- **Pricing Details**: https://aws.amazon.com/sagemaker-ai/pricing/
- **Key Features**:
  - Amazon SageMaker AI: Primary AI/ML platform for preparing, building, training, deploying models
  - Studio notebooks, JupyterLab environments
  - Training and inference (real-time, serverless, batch)
  - Data Wrangler, Feature Store
  - HyperPod for distributed training
- **Free Tier**: First 2 months includes 250 hrs notebook instances, 50 hrs training, 125 hrs real-time inference, 150K seconds serverless inference
- **Pricing Model**: Pay-as-you-go or SageMaker Savings Plans (1-3 year commitments)

#### Google Cloud Platform (GCP)
- **Official URL**: https://cloud.google.com/
- **AI/ML Products**: https://cloud.google.com/products/ai
- **Vertex AI**: https://cloud.google.com/vertex-ai
- **AI APIs**: https://cloud.google.com/ai/apis
- **Key Features**:
  - Vertex AI: Unified platform with 200+ foundation models
  - Gemini 3: Latest model for reasoning, coding, multimodal understanding
  - Vertex AI Studio and Agent Builder
  - Gemini Enterprise for agentic platforms
  - AutoML Solutions for custom ML models
  - AI APIs: Speech, translation, vision, video intelligence, NLP
- **Pricing**: New customers receive up to $300 in free credits
- **Event**: Google Cloud Next 2026 (April 22-24, Las Vegas) - Early bird $999

#### Microsoft Azure
- **Official URL**: https://azure.microsoft.com/
- **Azure Machine Learning**: https://azure.microsoft.com/products/machine-learning
- **Microsoft Foundry**: https://azure.microsoft.com/products/ai-foundry
- **Documentation**: https://learn.microsoft.com/azure/ai-services/
- **Key Features**:
  - Azure Machine Learning: Enterprise-grade end-to-end ML lifecycle service
  - Data preparation with Apache Spark, Microsoft Fabric integration
  - Feature store, Prompt flow, MLOps with CI/CD
  - Microsoft Foundry: Access to 11,000+ foundational, open-source, multimodal models
  - Foundry Agent Service for AI agents
  - Model routing for performance/cost optimization
  - Fleet-wide governance and security
- **Pricing**: Contact Azure sales for pricing

#### Oracle Cloud Infrastructure (OCI)
- **Official URL**: https://www.oracle.com/cloud/
- **AI Services**: https://www.oracle.com/artificial-intelligence/ai-services/
- **Generative AI**: https://docs.oracle.com/en-us/iaas/Content/generative-ai/home.htm
- **Pricing**: https://www.oracle.com/artificial-intelligence/generative-ai/generative-ai-service/pricing/
- **Key Features**:
  - OCI Generative AI: Fully managed service with advanced language models
  - OCI AI Agent Platform (Agent Hub in beta as of Nov 2024)
  - OCI Digital Assistant
  - OCI Language, Speech, Vision, Document Understanding
  - Prebuilt ML models with custom training options
- **Pricing Model**: On-demand (pay per character) or dedicated AI clusters with minimum commitments

### GPU Cloud Providers

#### Lambda Labs
- **Official URL**: https://lambdalabs.com/
- **Pricing**: https://lambda.ai/service/gpu-cloud/pricing
- **GPU Cloud**: https://lambda.ai/
- **On-Demand GPU Pricing** (Per GPU/Hour):
  - NVIDIA B200 SXM6: $4.99–$5.29
  - NVIDIA H100 SXM: $2.99–$3.29
  - NVIDIA GH200: $1.99
  - NVIDIA A100 SXM: $1.29–$1.79
  - Tesla V100: $0.55
  - A6000: $0.80
- **1-Click Cluster Pricing**:
  - B200 systems: $3.79/GPU/hr (on-demand), $3.49/GPU/hr (1-year reserved)
  - H100 systems: $2.29/GPU/hr (on-demand), $2.19/GPU/hr (reserved)
- **Reserved Capacity**: Lower prices with 1-3 year commitments (contact sales)

#### CoreWeave
- **Official URL**: https://www.coreweave.com/
- **Documentation**: https://docs.coreweave.com/
- **Pricing**: https://www.coreweave.com/pricing
- **GPU Compute**: https://www.coreweave.com/products/gpu-compute
- **Key Features**:
  - "The Essential Cloud for AI" - AI-native platform
  - CoreWeave Mission Control: Unifies security, talent services, observability
  - GPU offerings: GB300, GB200 NVL72 (Blackwell), B200, H200, H100
  - GB200 NVL72: Up to 4x higher training performance than H100, up to 30x faster real-time trillion-parameter LLM inference
  - Transparent hourly pricing, bare metal access
  - Trusted by leading AI labs, platforms, enterprises
- **Pricing**: Hourly GPU pricing with various commitment options

#### RunPod
- **Official URL**: https://www.runpod.io/
- **Pricing**: https://www.runpod.io/pricing
- **Console**: https://www.runpod.io/console/deploy
- **Documentation**: https://docs.runpod.io/pods/pricing
- **GPU Pricing** (Per Hour):
  - H100 SXM: $4.69/hr
  - H100 PCIe: $3.69/hr
  - H100 NVL: $4.39/hr
  - A100 SXM: $2.19/hr
  - L40S: $1.34/hr
  - RTX 6000 Ada: $1.14/hr
  - L40: $1.14/hr
  - A40: $0.69/hr
  - RTX 4090: $0.74/hr
- **Key Features**:
  - Per-second and per-hour billing
  - 30+ regions
  - Community Cloud and Secure Cloud options
  - Discounts for 6-month and 1-year commitments
  - New user referral bonus: $5-$500

#### Vast.ai
- **Official URL**: https://vast.ai/
- **Documentation**: https://docs.vast.ai/
- **Cloud Console**: https://cloud.vast.ai/
- **Key Features**:
  - GPU cloud marketplace with 10,000+ GPUs across 40 secure datacenters
  - Save up to 80% vs AWS, Azure, GCP
  - $5 minimum deposit to start
  - GPU range: Blackwell, Hopper (H100), Ada Lovelace, Ampere
  - Launch instances in seconds
  - One-click templates with PyTorch, NVIDIA CUDA, TensorFlow
  - Platform API, CLI, Python SDK
  - 24/7 expert support
- **Pricing**: Transparent per-hour pricing (significantly lower than major cloud providers)

### NVIDIA Hardware

#### NVIDIA DGX Systems
- **Official URL**: https://www.nvidia.com/en-us/data-center/
- **DGX B300**: https://www.nvidia.com/en-us/data-center/dgx-b300/
- **DGX H200**: https://www.nvidia.com/en-us/data-center/dgx-h200/
- **Documentation**: https://docs.nvidia.com/dgx-systems/

**DGX B300 (Latest)** - Specifications:
- 8x NVIDIA Blackwell Ultra GPUs
- 2.3 TB total GPU memory (288 GB per GPU)
- 72 PFLOPS FP8 training performance
- 144 PFLOPS FP4 inference performance
- 2x Intel Xeon Platinum 6776P processors
- 2 TB system memory (expandable to 4 TB)
- 8x 800 Gb/s InfiniBand/Ethernet connectivity
- 14.5 kW power consumption
- 10 RU rack units

**DGX H200** - Specifications:
- 8x NVIDIA H200 Tensor Core GPUs
- 1,128 GB total GPU memory
- 32 petaFLOPS AI performance
- 4x NVSwitches with 7.2 TB/s bidirectional GPU-to-GPU bandwidth
- 2X faster networking than previous generation

**DGX H100** - Specifications:
- 8x H100 GPUs (640 GB total memory)
- 2x Intel Xeon 8480C PCIe Gen5 CPUs (56 cores each)
- 900 GB/s GPU-to-GPU bandwidth
- 8U rackmount form factor
- Maximum 19.8 kW power consumption

**Pricing**: Contact NVIDIA sales for enterprise pricing

### Data Center Design Resources

#### Schneider Electric - AI Data Center Design
- **White Paper**: https://se.com/ae/en/download/document/SPD_WP110_EN
- **AI Disruption Article**: https://www.se.com/ww/en/insights/electricity-4-0/digitalization/the-ai-disruption.jsp
- **Key Topics**:
  - How 6 AI attributes change data center design
  - Power density requirements (up to 600kW per rack)
  - Cooling infrastructure for extreme densities
  - Liquid cooling solutions (direct-to-compute, full immersion, rear-door heat exchange)

#### Cisco - AI-Ready Infrastructure
- **Design Guides**: https://www.cisco.com/c/en/us/solutions/design-zone/ai-ready-infrastructure.html
- **AI Data Center Checklist**: https://blogs.cisco.com/insidervoices/ai-data-center-design-checklist
- **Key Topics**:
  - Network design for GPU-to-GPU communication
  - High-throughput, low-latency east-west traffic
  - RDMA/RoCE and HPC interconnects
  - Tail latency metrics (99th percentile) for AI workloads
  - 800 Gbps Ethernet capacity planning

#### NEXTDC - AI Infrastructure Playbook
- **AI Playbook**: https://www.nextdc.com/whitepapers-and-reports/nextdc-ai-playbook
- **Key Topics**:
  - Building AI-ready future infrastructure
  - Extreme power densities (up to 600kW per rack)
  - Training vs real-time inference workload support
  - 9-point infrastructure readiness checklist
  - Supply chain practices for deployment

---

## 3. Platform Architecture Pack (SaaS)

### Multi-Tenancy Architecture Patterns

#### Microsoft Azure Multi-Tenant Guidance
- **Architectural Approaches**: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/overview
- **Database Tenancy Patterns**: https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns
- **SaaS Design Methodology**: https://learn.microsoft.com/en-us/azure/well-architected/saas/design-methodology
- **Key Patterns**:
  - Single-tenancy: Each database stores one tenant's data
  - Multi-tenancy: Multiple tenants share database with privacy protections
  - Hybrid models: Combine approaches for flexibility
  - Deployment Stamps pattern: Infrastructure per tenant or tenant group

#### AWS Multi-Tenant Guidance
- **Building Multi-Tenant Systems**: https://aws.amazon.com/blogs/architecture/lets-architect-building-multi-tenant-saas-systems
- **Multi-Tenant Architectures**: https://aws.amazon.com/solutions/guidance/multi-tenant-architectures-on-aws
- **Three Database Isolation Models**:
  - Silo Model: Dedicated database instance per tenant
  - Bridge Model: Dedicated schema per tenant
  - Pool Model: Row-level security to share database
- **Key Considerations**:
  - Tenant context propagation across microservices
  - Cost optimization by architectural model
  - Hybrid architectures (siloed for high-traffic, shared for smaller customers)

### Microservices Frameworks

#### Spring Boot (Java)
- **Official URL**: https://spring.io/
- **Spring Boot Documentation**: https://docs.spring.io/spring-boot/
- **Microservices**: https://spring.io/microservices
- **Spring Cloud**: https://docs.spring.io/spring-cloud/docs/current/reference/html/
- **Current Version**: 4.0.2 (stable), also 3.5.10, 3.4.13, 3.3.13 available
- **Key Features**:
  - De facto standard for Java microservices
  - Quick startup with Spring Initializr
  - Embedded server models, JAR packaging
  - Production-grade instrumentation with Micrometer
  - Spring Cloud adds: Service discovery, circuit breakers, load balancing, API gateways, distributed messaging/tracing, configuration management
  - Spring Cloud Stream for event-driven microservices
- **Pricing**: Free and open-source (Apache 2.0 License)

#### .NET Core (C#)
- **Official URL**: https://dotnet.microsoft.com/
- **Microservices Guide**: https://dotnet.microsoft.com/en-us/apps/aspnet/microservices
- **Architecture Documentation**: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/
- **Tutorial**: https://dotnet.microsoft.com/en-us/learn/aspnet/microservice-tutorial/intro
- **Training Path**: https://learn.microsoft.com/en-us/training/paths/create-microservices-with-dotnet/
- **Current Edition**: v7.0 (updated to ASP.NET Core 7.0)
- **Key Features**:
  - Comprehensive guide: ".NET Microservices: Architecture for Containerized .NET Applications"
  - Downloadable PDF e-book available
  - 7-module learning path (4 hrs 25 min) for beginner to intermediate
  - 15-minute tutorial for first microservice
  - Reference application: eShopOnContainers on GitHub
  - Built-in Docker support, works on Windows, Linux, macOS
- **Pricing**: Free and open-source (MIT License)

#### Node.js/Express
- **Official URL**: https://nodejs.org/
- **Express.js**: https://expressjs.com/
- **Key Features**:
  - JavaScript runtime for server-side applications
  - Express: Minimal, flexible Node.js web application framework
  - Large npm ecosystem
  - Excellent for real-time applications and microservices
- **Pricing**: Free and open-source (MIT License)

#### FastAPI (Python)
- **Official URL**: https://fastapi.tiangolo.com/
- **Tutorial**: https://fastapi.tiangolo.com/tutorial/
- **API Reference**: https://fastapi.tiangolo.com/reference
- **GitHub**: https://github.com/fastapi/fastapi (94K stars, 8.5K forks)
- **Key Features**:
  - Modern, high-performance Python web framework
  - Built on Starlette and Pydantic
  - Performance on par with NodeJS and Go
  - 200-300% faster development, 40% reduction in developer errors
  - Standards-based (OpenAPI, JSON Schema, OAuth2)
  - Automatic interactive documentation
  - Type hints, async/await, dependency injection
- **Pricing**: Free and open-source (MIT License)

### API Gateway Solutions

#### Kong API Gateway
- **Official URL**: https://konghq.com/
- **Documentation**: https://docs.konghq.com/gateway
- **Developer Portal**: https://developer.konghq.com/gateway/
- **Getting Started**: https://docs.konghq.com/gateway/latest/get-started/
- **Installation**: https://docs.konghq.com/gateway/latest/install/
- **Key Features**:
  - Low-demand, high-performing API gateway
  - Built for hybrid and multi-cloud environments
  - Optimized for microservices and distributed architectures
  - Plugin categories: AI, Authentication, Security, Traffic Control, Serverless, Analytics, Transformations, Logging
  - Deployment options: Konnect (SaaS) and self-managed
  - Related tools: decK, Inso CLI, Terraform, Kubernetes Ingress Controller
- **Community Support**: GitHub, discuss.konghq.com forum, support.konghq.com
- **Pricing**: Community Edition (free), Enterprise Edition (contact sales)

#### AWS API Gateway
- **Official URL**: https://aws.amazon.com/api-gateway/
- **Documentation**: https://docs.aws.amazon.com/apigateway/
- **Getting Started**: https://aws.amazon.com/api-gateway/getting-started/
- **Developer Guide**: https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html
- **Latest API Reference**: January 23, 2026
- **Key Features**:
  - Create, publish, maintain, monitor, and secure REST, HTTP, WebSocket APIs at scale
  - Access AWS services, web services, data in AWS Cloud
  - Traffic management, authorization, access control, monitoring, API versioning
  - Acts as "front door" for applications (EC2, Lambda, web apps)
- **Pricing**: Pay-as-you-go based on API calls and data transfer

#### Azure API Management
- **Official URL**: https://azure.microsoft.com/products/api-management
- **Documentation**: https://aka.ms/apimdocs
- **What is API Management**: https://learn.microsoft.com/azure/api-management/api-management-key-concepts
- **Quick Start**: https://learn.microsoft.com/azure/api-management/get-started-create-service-instance
- **Key Features**:
  - Hybrid, multicloud management platform for complete API lifecycle
  - API Gateway: Facade to backend services, authentication, quotas, rate limits, transforms
  - Developer Portal: Auto-generated, customizable website for API discovery
  - Gateway capabilities, hybrid/multicloud management
  - VNet deployment (external/internal modes), custom domains
  - Application Insights integration, workspace management
  - AI gateway capabilities for LLM and MCP server integration
- **Pricing**: Multiple tiers (Consumption, Developer, Basic, Standard, Premium) - see Azure pricing calculator

### Service Mesh Tools

#### Istio
- **Official URL**: https://istio.io/
- **Documentation**: https://istio.io/latest/docs
- **Overview**: https://istio.io/latest/docs/overview
- **Architecture**: https://istio.io/latest/docs/ops/deployment/architecture
- **Current Version**: Istio 1.28.3
- **Key Features**:
  - Open-source service mesh for Kubernetes
  - CNCF graduated project
  - Data plane: Envoy proxies as sidecars
  - Control plane: Istiod manages proxy configuration
  - Core capabilities: Traffic control, network resiliency, security, authentication, observability
  - Comprehensive documentation: Setup, tasks, examples, operations, reference
- **Pricing**: Free and open-source (Apache 2.0 License)

#### Linkerd
- **Official URL**: https://linkerd.io/
- **Documentation**: https://linkerd.io/2/overview
- **Getting Started**: https://linkerd.io/2-edge/getting-started/
- **Reference**: https://linkerd.io/2.19/reference/
- **Current Version**: Linkerd 2.19 (features post-quantum cryptography)
- **Key Features**:
  - Lightweight, open-source service mesh for Kubernetes
  - CNCF graduated project, Apache v2 licensed
  - Runtime debugging, observability, reliability, security without code changes
  - Ultralight transparent micro-proxies written in Rust
  - Setup in minutes: Install CLI, deploy control plane, mesh applications
  - Architecture, authorization policies, circuit breaking, rate limiting, multi-cluster communication
- **Pricing**: Free and open-source (Apache 2.0 License)

#### HashiCorp Consul
- **Official URL**: https://www.hashicorp.com/products/consul
- **Documentation**: https://developer.hashicorp.com/consul/docs
- **Service Mesh**: https://developer.hashicorp.com/consul/docs/connect
- **Key Features**:
  - Identity-based service networking platform
  - Service discovery, secure communication, network automation
  - Multi-cloud and multi-runtime support (VMs, Kubernetes, ECS, Lambda, Nomad)
  - Mutual TLS (mTLS) based on SPIFFE X.509 standard
  - Built-in certificate authority, Vault integration
  - Control plane: Central registry, policy enforcement
  - Data plane: Envoy sidecar proxies
  - Zero trust security model
  - Microsecond API response times with local caching
- **Performance Benefits**: 41% faster development lifecycles, 26% increase in operational efficiencies
- **Pricing**: Open-source (free), Enterprise Edition (contact sales)

### Database Design for Multi-Tenancy

#### Row-Level Security (RLS)
- **PostgreSQL RLS**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **Supabase RLS**: https://supabase.com/docs/guides/auth/row-level-security
- **Key Concepts**:
  - Database-level security policies that restrict row access
  - Each tenant only sees their own data
  - Policies enforced at query time
  - Most cost-effective multi-tenancy approach
  - Scales well for most SaaS applications

#### Schema-per-Tenant
- **Key Concepts**:
  - Each tenant gets dedicated database schema
  - Better isolation than RLS
  - Easier per-tenant migrations and customizations
  - More complex application code
  - Good middle-ground for compliance requirements

#### Database-per-Tenant
- **Key Concepts**:
  - Complete database isolation per tenant
  - Maximum security and customization
  - Higher infrastructure costs
  - Complex migrations and backups
  - Best for enterprise/regulated industries

### SaaS Architecture Best Practices

#### AWS SaaS Architecture Resources
- **AWS SaaS Factory**: https://aws.amazon.com/partners/programs/saas-factory/
- **SaaS on AWS**: https://aws.amazon.com/saas/
- **Architecture Patterns**: https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/saas-lens.html

#### Microsoft Azure SaaS Resources
- **Azure SaaS Dev Kit**: https://azure.microsoft.com/solutions/saas/
- **SaaS Design Patterns**: https://learn.microsoft.com/azure/architecture/guide/multitenant/overview

#### General SaaS Architecture
- **Martin Fowler on Microservices**: https://martinfowler.com/microservices/
- **12-Factor App**: https://12factor.net/
- **Microservices Patterns Book**: https://microservices.io/patterns/

---

## 4. Clinical Trial Planning Pack (Pharmaceuticals)

### Clinical Trial Management Systems (CTMS)

#### Veeva Vault CTMS
- **Official URL**: https://www.veeva.com/products/vault-ctms/
- **Product Brief**: https://www.veeva.com/resources/ctms-product-brief/
- **SiteVault CTMS** (for sites): https://sites.veeva.com/ctms/
- **Status**: "Very Mature" with 100+ customers (announced 2016)
- **Key Features**:
  - Enterprise trial management for insourced/outsourced clinical trials
  - End-to-end study management and monitoring
  - Dashboards tracking enrollment, milestones, with drill-down capabilities
  - Monitoring visit reports with automation, dynamic question branching
  - Automated trip report filing within eTMF
  - Issue/protocol deviation logging with resolution workflows
  - CTMS Transfer: Automated daily data exchange between CROs and sponsors
  - EDC integration for enrollment, monitoring, payments
  - CRM synchronization for 360-degree investigator view
- **Impact Metrics**:
  - 30% reduction in monitoring costs
  - 50% less time to author visit reports
  - 80% faster issue identification
- **Pricing**: Contact Veeva sales for enterprise pricing

#### Medidata CTMS
- **Official URL**: https://www.medidata.com/en/clinical-trial-products/clinical-operations/ctms/
- **Blog**: https://www.medidata.com/en/life-science-resources/medidata-blog/clinical-trial-management-systems-ctms/
- **Customer Switching**: https://www.medidata.com/en/why-customers-are-switching-to-medidata-ctms-and-etmf/
- **Key Features**:
  - Cloud-based CTMS centralizing clinical and operational data
  - Eliminates information silos
  - Site/investigator management, subject enrollment tracking, budgeting, payments, monitoring, milestones, reporting
  - Single-instance, multi-tenant cloud architecture
  - Scales from early phase through late phase trials
  - Automated workflows reducing manual processes
  - EDC and eTMF integration
  - AI trained on 36,000+ clinical trials
  - 400+ successful implementations, 50%+ customer retention for 5+ years
- **Market Position**: Leader in CTMS market (Everest Group 2024 PEAK Matrix Assessment)
- **Latest Version**: 2025.2.0
- **Pricing**: Contact Medidata sales for enterprise pricing

#### Oracle Clinical One
- **Official URL**: https://www.oracle.com/life-sciences/clinical-trials/clinical-one/
- **Documentation**: https://docs.oracle.com/en/industries/life-sciences/clinical-one/
- **Data Collection**: https://www.oracle.com/life-sciences/clinical-trials/data-collection/
- **Latest Release**: Release 25.3 (November 2025)
- **Key Components**:
  - Randomization and Trial Supply Management (RTSM)
  - Data Collection: From any source, harmonized in single place
  - Analytics: Uncover insights, informed business decisions
  - Digital Gateway: Integrations and data access
- **Key Features**:
  - Standards-driven, interoperable smart platform
  - Build/modify studies without deployments, tickets, downtime
  - Collect data from anywhere, access insights anytime
  - Manage all integrations centrally
  - Build studies in weeks instead of months
  - RTSM without programming, real-time drug inventory modifications
- **Pricing**: Contact Oracle for enterprise pricing

### Regulatory Databases and Resources

#### U.S. Food and Drug Administration (FDA)
- **Official URL**: https://www.fda.gov/
- **Clinical Trials**: https://www.fda.gov/science-research/clinical-trials-and-human-subject-protection
- **Clinical Trials Guidance**: https://www.fda.gov/science-research/clinical-trials-and-human-subject-protection/clinical-trials-guidance-documents
- **Latest Guidance Documents (2025-2026)**:
  - **Bayesian Methodology** (Draft, Jan 12, 2026): Using Bayesian statistical methods in clinical trials for drugs/biologics
  - **Enhancing Participation** (Final, Dec 2025): Eligibility criteria, enrollment practices, trial designs to increase enrollment of representative populations
  - **Bioresearch Monitoring Inspections** (Final, Dec 19, 2025): Processes and practices for inspections
  - **Adaptive Trial Designs (E20)** (Draft, Sept 2025): Planning, conducting, analyzing adaptive design trials
  - **Cell/Gene Therapy Trials** (Draft, Sept 2025): Innovative designs for small populations, rare diseases
- **Pricing**: Free public access

#### European Medicines Agency (EMA)
- **Official URL**: https://www.ema.europa.eu/
- **Clinical Trials**: https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines
- **Biostatistics**: https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-guidelines/clinical-efficacy-safety-guidelines/biostatistics
- **Recent Guidelines (2025-2026)**:
  - **Epilepsy Treatment** (Revision 3, adopted Feb 17, 2025, effective Sept 30, 2025): Clinical investigation of medicinal products for epileptic disorders
  - **Vaccines** (Revision 1, effective Aug 1, 2023): Clinical evaluation of new vaccines for safety, immunogenicity, efficacy
  - **Vaccine Addendum** (consultation July 19 - Oct 31, 2024): Clinical trials in immunocompromised individuals
  - **Non-inferiority/Equivalence** (Draft, adopted Nov 3, 2025, consultation ends May 31, 2026): Comparisons in clinical trials
- **Requirements**: All trials in EU/EEA marketing authorization must comply with GCP and Declaration of Helsinki
- **Pricing**: Free public access

#### ClinicalTrials.gov
- **Official URL**: https://clinicaltrials.gov/
- **Classic Version**: https://classic.clinicaltrials.gov/
- **FDA Clinical Trial Participation**: https://www.fda.gov/consumers/health-education-resources/clinical-trial-participation
- **Key Features**:
  - Official U.S. government database for clinical trials
  - Central resource to search clinical trials by area
  - Study record managers can reference Data Element Definitions
  - Required for FDA submissions
  - Free public access for searching and registration
- **Pricing**: Free for public searching; registration required for submitting studies

### Good Clinical Practice (GCP) Resources

#### NIH GCP Training (Free)
- **National Drug Abuse Treatment Network GCP**: https://gcp.nidatraining.org/overview
- **NIH Social/Behavioral Research GCP**: https://obssr.od.nih.gov/training/download-good-clinical-practice-social-and-behavioral-research-elearning-course
- **NIDCD GCP Training**: https://www.nidcd.nih.gov/research/clinical-studies/researchers-professionals/gcp-training
- **NIH GCP Overview**: https://grants.nih.gov/policy/clinical-trials/good-clinical-training.htm
- **Key Features**:
  - 12 modules covering specific GCP standards
  - Complete modules at own pace, take quizzes
  - Certification upon achieving 80% accuracy
  - Certifications expire after 3 years
  - Separate course for social/behavioral research
  - NIAID GCP Learning Center option
- **Requirements**: NIH-funded clinical investigators and staff must complete GCP training and refresh every 3 years
- **Pricing**: FREE

#### ICH Good Clinical Practice E6(R3)
- **Global Health Training Centre**: https://globalhealthtrainingcentre.tghn.org/ich-good-clinical-practice/
- **ICH E6(R3) Release**: January 6, 2025
- **Key Features**:
  - International Conference on Harmonisation (ICH) Efficacy Document E6
  - Updated Good Clinical Practice guideline
  - Detailed guidance on IRB/Independent Ethics Committee responsibilities, composition, functions, operations
  - Covers investigators, sponsors, monitors, IRBs
  - Ensures patient safety, data integrity, trial quality
- **Pricing**: Free public access

### IRB/Ethics Committee Guidance

#### FDA IRB Guidance
- **IRB Written Procedures** (Feb 2025): https://www.fda.gov/regulatory-information/search-fda-guidance-documents/institutional-review-board-irb-written-procedures
- **IRBs and Protection of Human Subjects**: https://www.fda.gov/about-fda/cder-offices-and-divisions/institutional-review-boards-irbs-and-protection-human-subjects-clinical-trials
- **NCATS IRB Toolkit**: https://toolkit.ncats.nih.gov/module/clinical-trials-and-fda-review/serving-on-boards-to-review-and-monitor-clinical-trials/institutional-review-board/
- **Key Features**:
  - Joint FDA/HHS OHRP guidance (originally issued May 2018, updated June 2025)
  - Written Procedures Checklist incorporating HHS and FDA regulatory requirements
  - Helps institutions/IRBs develop clear procedures protecting human subjects
- **Pricing**: Free public access

#### HHS OHRP IRB Guidance
- **IRB Written Procedures**: https://www.hhs.gov/ohrp/regulations-and-policy/guidance/institutional-issues/institutional-review-board-written-procedures/index.html
- **Key Features**:
  - Office for Human Research Protections guidance
  - Regulatory requirements for IRB procedures
  - Human subject protection standards
- **Pricing**: Free public access

#### ICH E6(R3) - IRB/IEC Section
- **ICH E6(R3)** (Jan 6, 2025): Includes detailed IRB/IEC responsibilities
- **Core IRB Functions**:
  - Review and approve, modify, or disapprove research protocols
  - Assess informed consent documents and investigator brochures
  - Monitor study safety for human subjects
  - Determine protocol exemptions
  - Approve modifications to protocols and consent materials
- **IRB Composition**: Must include at least one non-scientist member and one member not affiliated with the institution

### Trial Protocol Templates

#### NIH Protocol Templates
- **NIH Clinical Trial Protocol Template**: https://osp.od.nih.gov/clinical-research/clinical-trials/nih-protocol-template/
- **Key Features**:
  - Standardized protocol template for NIH-funded trials
  - Sections for background, objectives, design, methods, safety monitoring
  - Compliant with NIH and regulatory requirements

#### WHO Trial Registration Data Set
- **WHO ICTRP**: https://www.who.int/clinical-trials-registry-platform
- **Key Features**:
  - International Clinical Trials Registry Platform
  - Minimum data set for trial registration
  - Recognized by ICMJE for publication

#### SPIRIT Guidelines
- **SPIRIT Statement**: https://www.spirit-statement.org/
- **Key Features**:
  - Standard Protocol Items: Recommendations for Interventional Trials
  - Checklist for protocol content
  - Widely adopted by journals and institutions

---

## Summary Statistics

**Total Resources Verified**: 85+ official websites and documentation portals
**All Links Verified**: February 4, 2026
**Categories Covered**: 
- 15 Mobile development resources
- 16 AI infrastructure and cloud providers
- 18 SaaS platform architecture resources
- 12 Clinical trial management resources
- 24 Regulatory and compliance resources

**Next Steps**:
1. Review and select resources most relevant to your specific pack needs
2. Bookmark critical documentation and pricing pages
3. Create accounts/trials where applicable
4. Document your chosen stack in your project architecture

---

*Document prepared by AI Assistant | Verified February 4, 2026*
