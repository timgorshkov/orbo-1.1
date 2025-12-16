#!/bin/bash
# ============================================
# Orbo Server Setup Script
# ============================================
# 
# This script sets up a fresh Ubuntu 24.04 server for Orbo deployment.
# Run as root on the Selectel server.
#
# Usage:
#   chmod +x setup-server.sh
#   sudo ./setup-server.sh
#

set -e

echo "============================================"
echo "  Orbo Server Setup - Ubuntu 24.04"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# ============================================
# 1. System Update
# ============================================
echo -e "${YELLOW}[1/7] Updating system...${NC}"
apt update && apt upgrade -y

# ============================================
# 2. Install Essential Packages
# ============================================
echo -e "${YELLOW}[2/7] Installing essential packages...${NC}"
apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    htop \
    vim \
    ufw \
    fail2ban \
    unzip \
    wget

# ============================================
# 3. Create Deploy User
# ============================================
echo -e "${YELLOW}[3/7] Creating deploy user...${NC}"
if id "deploy" &>/dev/null; then
    echo "User 'deploy' already exists"
else
    adduser --disabled-password --gecos "" deploy
    usermod -aG sudo deploy
    
    # Allow sudo without password for deploy user
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
    chmod 440 /etc/sudoers.d/deploy
fi

# Setup SSH for deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true

# ============================================
# 4. Configure SSH Security
# ============================================
echo -e "${YELLOW}[4/7] Configuring SSH security...${NC}"

# Backup original sshd_config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Disable password authentication
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Disable root login (optional - uncomment after verifying deploy user works)
# sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
# sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Restart SSH
systemctl restart sshd

# ============================================
# 5. Configure Firewall (UFW)
# ============================================
echo -e "${YELLOW}[5/7] Configuring firewall...${NC}"

# Reset UFW
ufw --force reset

# Set defaults
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable UFW
echo "y" | ufw enable

# Show status
ufw status verbose

# ============================================
# 6. Install Docker
# ============================================
echo -e "${YELLOW}[6/7] Installing Docker...${NC}"

# Remove old versions
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add deploy user to docker group
usermod -aG docker deploy

# Start Docker
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker compose version

# ============================================
# 7. Setup fail2ban
# ============================================
echo -e "${YELLOW}[7/7] Configuring fail2ban...${NC}"

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ============================================
# Create Orbo Directory Structure
# ============================================
echo -e "${YELLOW}Creating Orbo directory structure...${NC}"

mkdir -p /home/deploy/orbo/{app,data,nginx,scripts,backups}
mkdir -p /home/deploy/orbo/data/{postgres,postgres-backup,certbot}
mkdir -p /home/deploy/orbo/nginx/{ssl,logs}
chown -R deploy:deploy /home/deploy/orbo

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Server Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo "1. Copy your SSH public key to /home/deploy/.ssh/authorized_keys"
echo "2. Test login as deploy user: ssh deploy@$(hostname -I | awk '{print $1}')"
echo "3. Copy your project files to /home/deploy/orbo/app/"
echo "4. Configure .env file in /home/deploy/orbo/"
echo "5. Run: cd /home/deploy/orbo && docker compose up -d"
echo ""
echo "Server IP: $(hostname -I | awk '{print $1}')"
echo ""

