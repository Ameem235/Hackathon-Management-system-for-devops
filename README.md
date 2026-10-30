# Hackathon Event Management System

A production-ready, three-tier cloud-native application deployed on Kubernetes (Minikube) with an automated CI/CD pipeline using Jenkins and Docker Hub.

---

## Architecture Overview

```
                                      +------------------------------------+
                                      |         Kubernetes Cluster         |
                                      |        (Namespace: hackathon)       |
                                      |                                    |
[ Client Browser / Curl ]             |  +------------------------------+  |
           |                          |  |      Frontend Service        |  |
           | :8081 (Docker Compose)   |  |     (NodePort: 30080 / :80)  |  |
           | :30080 (Minikube)        |  +--------------+---------------+  |
           v                          |                 |                  |
+---------------------+               |                 v                  |
| Frontend Tier       |               |  +------------------------------+  |
| - Nginx (Alpine)    |               |  |      Frontend Pods (x2)      |  |
| - Static HTML/CSS/JS|               |  |  (Static Assets + Reverse    |  |
| - Reverse Proxy     +--- /api/* --->|  |   Proxy /api/ to backend)    |  |
+---------------------+               |  +--------------+---------------+  |
                                      |                 |                  |
                                      |                 v                  |
+---------------------+               |  +------------------------------+  |
| Backend Tier        |               |  |       Backend Service        |  |
| - Node.js 18 (Alpine)               |  |     (ClusterIP: 5000)        |  |
| - Express REST API  |               |  +--------------+---------------+  |
| - Retry Loop (30x3s)|               |                 |                  |
| - Auto Schema Init  |               |                 v                  |
+----------+----------+               |  +------------------------------+  |
           |                          |  |      Backend Pods (x2)       |  |
           | :3306                    |  | (Express REST API / Probes)  |  |
           v                          |  +--------------+---------------+  |
+---------------------+               |                 |                  |
| Database Tier       |               |                 v                  |
| - MySQL 8.0         |               |  +------------------------------+  |
| - DB: hackathon     |               |  |        MySQL Service         |  |
| - PVC Persistence   |<--------------+  |     (ClusterIP: 3306)        |  |
+---------------------+               |  +--------------+---------------+  |
                                      |                 |                  |
                                      |                 v                  |
                                      |  +------------------------------+  |
                                      |  |   MySQL Pod (1x) + PVC (1Gi) |  |
                                      |  +------------------------------+  |
                                      +------------------------------------+
```

### Components

1. **Frontend (`frontend/`)**:
   - Modern, responsive web portal for hackathon teams.
   - Served via lightweight `nginx:alpine`.
   - Built-in reverse proxy routing `/api/*` directly to `http://backend:5000/api/*`.
   - Features: Real-time backend connectivity badge, Team Registration, Team List, Team Deletion.

2. **Backend (`backend/`)**:
   - Node.js 18 (Alpine base) Express REST API on port 5000.
   - Uses `mysql2/promise` with automatic exponential retry (up to 30 attempts, 3s apart).
   - Auto-creates the `teams` table on first successful database handshake.
   - Endpoints:
     - `GET /api/health` — Cluster liveness and readiness probe endpoint.
     - `GET /api/teams` — Retrieve list of all registered teams.
     - `POST /api/teams` — Register a team (`team_name`, `members`, `project_idea`).
     - `DELETE /api/teams/:id` — Delete a team by ID.

3. **Database (`MySQL 8.0`)**:
   - Database name: `hackathon`.
   - In Kubernetes, credentials are injected securely via Kubernetes Secret (`mysql-secret`).
   - Persistent storage managed via PersistentVolumeClaim (`mysql-pvc`).

---

## Project Structure

```
hackathon-app/
├── frontend/
│   ├── Dockerfile            # Production multi-stage Alpine Nginx image
│   ├── nginx.conf            # Reverse proxy configuration (/api/ -> backend:5000)
│   └── index.html            # Single-page Hackathon Management application
├── backend/
│   ├── Dockerfile            # Lightweight Alpine Node.js 18 image (non-root)
│   ├── package.json          # Node dependencies (express, mysql2, cors)
│   └── server.js             # Express API with DB retries and schema initialization
├── k8s/
│   ├── namespace.yaml        # Dedicated namespace: hackathon
│   ├── mysql-secret.yaml     # Credentials Secret (passwords injected via env)
│   ├── mysql-pvc.yaml        # 1Gi PersistentVolumeClaim for database
│   ├── mysql-deployment.yaml # MySQL 8.0 Deployment (single replica, resource limits)
│   ├── mysql-service.yaml    # ClusterIP Service for MySQL (port 3306)
│   ├── backend-deployment.yaml# Backend Deployment (2 replicas, health probes)
│   ├── backend-service.yaml  # ClusterIP Service for Backend (port 5000)
│   ├── frontend-deployment.yaml# Frontend Deployment (2 replicas, resource limits)
│   └── frontend-service.yaml # NodePort Service for Frontend (NodePort 30080)
├── docker-compose.yml        # Local 3-tier testing stack (frontend on :8081)
├── Jenkinsfile               # Declarative CI/CD pipeline (Docker build, push, deploy, verify)
└── README.md                 # Complete documentation and operations manual
```

---

## 1. Local Development & Verification

You can verify the entire 3-tier architecture locally using Docker Compose before pushing to Kubernetes.

### Step 1.1: Build and Run with Docker Compose

Run the following command from the `hackathon-app` root directory:

```bash
docker compose up -d --build
```

Inspect running containers:
```bash
docker compose ps
```

### Step 1.2: Verify Health & API Endpoints

Once the MySQL healthcheck passes and the backend establishes connection:

1. **Check Backend Health:**
   ```bash
   curl -i http://localhost:8081/api/health
   ```
   *Expected Response:*
   ```json
   HTTP/1.1 200 OK
   {"status":"ok","database":"connected","timestamp":"..."}
   ```

2. **Register a New Team (POST):**
   ```bash
   curl -i -X POST http://localhost:8081/api/teams \
     -H "Content-Type: application/json" \
     -d '{"team_name":"CloudTitans","members":"Alice, Bob, Carol","project_idea":"AI-powered microservices monitoring"}'
   ```
   *Expected Response:*
   ```json
   HTTP/1.1 201 Created
   {"message":"Team registered successfully","team":{"id":1,"team_name":"CloudTitans",...}}
   ```

3. **List All Registered Teams (GET):**
   ```bash
   curl -i http://localhost:8081/api/teams
   ```
   *Expected Response:*
   ```json
   HTTP/1.1 200 OK
   [{"id":1,"team_name":"CloudTitans","members":"Alice, Bob, Carol","project_idea":"AI-powered microservices monitoring","registered_at":"..."}]
   ```

4. **Open in Browser:**
   Open [http://localhost:8081](http://localhost:8081) to view the interactive UI.

5. **Stop Local Stack:**
   ```bash
   docker compose down
   ```

---

## 2. Push Code to GitHub

Initialize the repository and push to your GitHub account:

```bash
cd hackathon-app
git init
git add .
git commit -m "feat: complete three-tier hackathon app with CI/CD and K8s manifests"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USER>/hackathon-app.git
git push -u origin main
```

---

## 3. Jenkins Host Configuration (Ubuntu Host)

The Jenkins pipeline runs directly on the Ubuntu host where Minikube and Docker are installed. To allow the `jenkins` system user to execute Docker builds and apply Kubernetes manifests to Minikube, complete the following one-time host setup.

### Step 3.1: Grant Docker Permissions to Jenkins

```bash
# Add jenkins user to the docker group
sudo usermod -aG docker jenkins

# Verify docker group membership
groups jenkins
```

### Step 3.2: Configure Minikube Kubeconfig for Jenkins

The `jenkins` user needs access to Minikube's `kubeconfig` and client certificates:

```bash
# Create .kube directory for jenkins user
sudo mkdir -p /var/lib/jenkins/.kube

# Copy your active kubeconfig and minikube certificates
sudo cp -r ~/.kube/config /var/lib/jenkins/.kube/config
sudo cp -r ~/.minikube /var/lib/jenkins/.minikube

# Set correct permissions and ownership for jenkins user
sudo chown -R jenkins:jenkins /var/lib/jenkins/.kube
sudo chown -R jenkins:jenkins /var/lib/jenkins/.minikube
sudo chmod 700 /var/lib/jenkins/.kube
sudo chmod 600 /var/lib/jenkins/.kube/config
```

### Step 3.3: Fix Internal Certificate Paths in Jenkins Kubeconfig

Minikube stores absolute certificate paths pointing to the original user's home directory (e.g., `/home/ubuntu/.minikube/`). Update these paths to point to `/var/lib/jenkins/.minikube/`:

```bash
# Replace previous home path with /var/lib/jenkins/.minikube in jenkins kubeconfig
sudo sed -i 's|/home/[^/]*/\.minikube|/var/lib/jenkins/.minikube|g' /var/lib/jenkins/.kube/config
```

### Step 3.4: Restart Jenkins Service

```bash
sudo systemctl restart jenkins
sudo systemctl status jenkins
```

Verify that the `jenkins` user can interact with both Docker and Kubernetes:
```bash
sudo -u jenkins docker ps
sudo -u jenkins kubectl get nodes
```

---

## 4. Setting up the Jenkins Pipeline

### Step 4.1: Add Docker Hub Credentials

1. Open Jenkins in your browser: `http://<UBUNTU_HOST_IP>:8080`.
2. Navigate to: **Manage Jenkins** &rarr; **Credentials** &rarr; **System** &rarr; **Global credentials (unrestricted)**.
3. Click **Add Credentials**:
   - **Kind:** `Username with password`
   - **Scope:** `Global`
   - **Username:** `<Your Docker Hub Username>`
   - **Password:** `<Your Docker Hub Personal Access Token or Password>`
   - **ID:** `dockerhub-creds`  *(Must match credentialsId in Jenkinsfile)*
   - **Description:** `Docker Hub Registry Credentials`
4. Click **Create**.

### Step 4.2: Update Docker Hub Username in Jenkinsfile

In `Jenkinsfile`, edit the `DOCKERHUB_USER` environment variable with your username:

```groovy
environment {
    DOCKERHUB_USER = 'YOUR_DOCKERHUB_USERNAME'
    BACKEND_IMAGE  = "${DOCKERHUB_USER}/hackathon-backend"
    FRONTEND_IMAGE = "${DOCKERHUB_USER}/hackathon-frontend"
    IMAGE_TAG      = "${BUILD_NUMBER}"
}
```
Commit and push the change to GitHub.

### Step 4.3: Create Jenkins Pipeline Job

1. From the Jenkins dashboard, click **New Item**.
2. Enter name: `hackathon-pipeline`.
3. Select **Pipeline** and click **OK**.
4. In the job configuration:
   - Scroll down to the **Pipeline** section.
   - Set **Definition** to: `Pipeline script from SCM`.
   - Set **SCM** to: `Git`.
   - **Repository URL:** `https://github.com/<YOUR_GITHUB_USER>/hackathon-app.git`.
   - **Branch Specifier:** `*/main`.
   - **Script Path:** `Jenkinsfile`.
5. Click **Save**.

### Step 4.4: Trigger Build

Click **Build Now**. The pipeline will:
1. Check out code from GitHub.
2. Build frontend and backend Docker images tagged with `${BUILD_NUMBER}`.
3. Authenticate with Docker Hub using `dockerhub-creds` and push both images.
4. Replace placeholder image tags in `k8s/` manifests using `sed` and apply them to namespace `hackathon`.
5. Wait for rollout status and print active cluster pods and services.

---

## 5. Accessing the Application in Kubernetes

Once the pipeline deploys to Minikube:

### Option A: Using Minikube Service URL (Recommended)

Run:
```bash
minikube service frontend -n hackathon --url
```
This prints the accessible URL (e.g. `http://192.168.49.2:30080`).

### Option B: Direct NodePort Access

Retrieve the Minikube IP:
```bash
minikube ip
```
Open in browser:
```
http://<MINIKUBE_IP>:30080
```

### Option C: Port-Forwarding (Local Access)

```bash
kubectl port-forward svc/frontend -n hackathon 8081:80
```
Then visit `http://localhost:8081`.

---

## 6. Monitoring Setup (Prometheus & Grafana)

Install Prometheus and Grafana on Minikube using Helm into a dedicated `monitoring` namespace.

### Step 6.1: Install Helm (if not installed)

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### Step 6.2: Add Prometheus Community Helm Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### Step 6.3: Install kube-prometheus-stack

Create the `monitoring` namespace and deploy the monitoring stack:

```bash
# Create namespace
kubectl create namespace monitoring

# Install kube-prometheus-stack
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

Verify pods are running:
```bash
kubectl get pods -n monitoring
```

### Step 6.4: Retrieve Grafana Admin Password

Run the following command to retrieve and decode the default admin password:

```bash
kubectl get secret --namespace monitoring kube-prometheus-stack-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```
*(Default username is `admin`)*.

### Step 6.5: Expose or Port-Forward Grafana

Forward port 3000 to access the Grafana dashboard locally:

```bash
kubectl port-forward svc/kube-prometheus-stack-grafana -n monitoring 3000:80
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
- **User:** `admin`
- **Password:** `<Password retrieved from Step 6.4>`

---

## 7. Troubleshooting Guide

### Issue 1: `ImagePullBackOff` or `ErrImagePull`
- **Cause:** The image specified in the deployment does not exist on Docker Hub, the repository is private, or the placeholder was not replaced.
- **Remedy:**
  1. Check the image name in the pod:
     ```bash
     kubectl describe pod -l app=backend -n hackathon
     ```
  2. Verify that the Jenkins build step successfully pushed `${DOCKERHUB_USER}/hackathon-backend:${BUILD_NUMBER}` to Docker Hub.
  3. If your Docker Hub repository is private, create an image pull secret in the namespace:
     ```bash
     kubectl create secret docker-registry dockerhub-registry-secret \
       --docker-server=https://index.docker.io/v1/ \
       --docker-username=<USER> \
       --docker-password=<PASS> \
       --docker-email=<EMAIL> \
       -n hackathon
     ```
     And add `imagePullSecrets: [{name: dockerhub-registry-secret}]` under `spec.template.spec`.

### Issue 2: `permission denied while trying to connect to the Docker daemon socket /var/run/docker.sock`
- **Cause:** The `jenkins` user is not a member of the host's `docker` group, or the service was not restarted after adding the group.
- **Remedy:**
  ```bash
  sudo usermod -aG docker jenkins
  sudo systemctl restart jenkins
  ```
  Ensure permissions on the socket:
  ```bash
  sudo chmod 666 /var/run/docker.sock
  ```

### Issue 3: `kubectl: connection refused` or `connectex: No connection could be made` from Jenkins
- **Cause:** The `jenkins` user cannot find `kubeconfig`, cannot read certificate keys, or the API server IP in kubeconfig is pointing to an outdated Minikube IP.
- **Remedy:**
  1. Test running `kubectl` as `jenkins`:
     ```bash
     sudo -u jenkins kubectl get nodes
     ```
  2. If permission denied on cert files:
     ```bash
     sudo chown -R jenkins:jenkins /var/lib/jenkins/.kube /var/lib/jenkins/.minikube
     sudo chmod -R 755 /var/lib/jenkins/.minikube
     ```
  3. Verify the cluster server IP in `/var/lib/jenkins/.kube/config` matches `minikube ip`:
     ```bash
     minikube ip
     grep server /var/lib/jenkins/.kube/config
     ```

### Issue 4: Database Connection Retries / CrashLoopBackOff
- **Cause:** MySQL container takes 10-15 seconds to initialize storage and start listening on port 3306.
- **Design Protection:**
  - The backend includes an automated 30-attempt retry loop (3 seconds between attempts) in `server.js`.
  - The liveness/readiness probes have an initial delay (`initialDelaySeconds: 5` and `15`) to give the backend sufficient time to connect.
- **Inspection:**
  ```bash
  kubectl logs -l app=backend -n hackathon -f
  kubectl logs -l app=mysql -n hackathon
  ```

#   H a c k a t h o n - M a n a g e m e n t - s y s t e m - f o r - d e v o p s  
 