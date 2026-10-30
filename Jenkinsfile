pipeline {
    agent any

    environment {
        // Replace with your Docker Hub username or pass as Jenkins parameter
        DOCKERHUB_USER = 'your-dockerhub-username'
        BACKEND_IMAGE  = "${DOCKERHUB_USER}/hackathon-backend"
        FRONTEND_IMAGE = "${DOCKERHUB_USER}/hackathon-frontend"
        IMAGE_TAG      = "${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                echo "Checking out source code from SCM..."
                checkout scm
            }
        }

        stage('Build Docker Images') {
            steps {
                echo "Building Docker images with tag ${IMAGE_TAG}..."
                sh """
                    docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend
                    docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./frontend
                """
            }
        }

        stage('Push Images to Docker Hub') {
            steps {
                echo "Pushing images to Docker Hub registry..."
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh """
                        echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker logout
                    """
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                echo "Updating manifests and deploying to Kubernetes namespace 'hackathon'..."
                sh """
                    # Substitute placeholder strings with active Docker Hub user and build tag
                    sed -i "s|DOCKERHUB_USER/hackathon-backend:IMAGE_TAG|${BACKEND_IMAGE}:${IMAGE_TAG}|g" k8s/backend-deployment.yaml
                    sed -i "s|DOCKERHUB_USER/hackathon-frontend:IMAGE_TAG|${FRONTEND_IMAGE}:${IMAGE_TAG}|g" k8s/frontend-deployment.yaml

                    # Apply manifests in the correct dependency order
                    kubectl apply -f k8s/namespace.yaml
                    kubectl apply -f k8s/mysql-secret.yaml
                    kubectl apply -f k8s/mysql-pvc.yaml
                    kubectl apply -f k8s/mysql-service.yaml
                    kubectl apply -f k8s/mysql-deployment.yaml
                    kubectl apply -f k8s/backend-service.yaml
                    kubectl apply -f k8s/backend-deployment.yaml
                    kubectl apply -f k8s/frontend-service.yaml
                    kubectl apply -f k8s/frontend-deployment.yaml
                """
            }
        }

        stage('Verify') {
            steps {
                echo "Verifying deployment rollouts in namespace 'hackathon'..."
                sh """
                    kubectl rollout status deployment/mysql -n hackathon --timeout=120s
                    kubectl rollout status deployment/backend -n hackathon --timeout=120s
                    kubectl rollout status deployment/frontend -n hackathon --timeout=120s

                    echo "Listing active resources in hackathon namespace:"
                    kubectl get pods,svc,pvc -n hackathon -o wide
                """
            }
        }
    }

    post {
        success {
            echo "=========================================================="
            echo "CI/CD Pipeline Completed Successfully!"
            echo "Application is deployed and operational in Minikube."
            echo "=========================================================="
        }
        failure {
            echo "=========================================================="
            echo "CI/CD Pipeline Failed! Please check the logs above."
            echo "=========================================================="
        }
    }
}

