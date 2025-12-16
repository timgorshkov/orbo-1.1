#!/bin/bash
# ============================================
# SSL Certificate Setup Script (Let's Encrypt)
# ============================================
#
# Obtains SSL certificates using Let's Encrypt certbot
# via Docker container.
#
# Prerequisites:
#   - Domain DNS already pointing to server IP
#   - Nginx container running
#   - Port 80 accessible from internet
#
# Usage:
#   ./ssl-setup.sh yourdomain.ru [your@email.com]
#

set -e

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: ./ssl-setup.sh <domain> [email]"
    echo "Example: ./ssl-setup.sh orbo.ru admin@orbo.ru"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-"admin@$DOMAIN"}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "  SSL Certificate Setup for $DOMAIN"
echo "============================================"

cd /home/deploy/orbo

# ============================================
# Step 1: Create initial nginx config (HTTP only)
# ============================================
echo -e "${YELLOW}[1/5] Creating initial HTTP-only nginx config...${NC}"

cat > nginx/nginx.conf << EOF
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 "Waiting for SSL certificate...";
            add_header Content-Type text/plain;
        }
    }
}
EOF

# ============================================
# Step 2: Start nginx (HTTP only)
# ============================================
echo -e "${YELLOW}[2/5] Starting nginx...${NC}"

docker compose up -d nginx
sleep 3

# Check nginx is running
if ! docker compose ps | grep -q "orbo_nginx.*Up"; then
    echo -e "${RED}Error: Nginx failed to start${NC}"
    docker compose logs nginx
    exit 1
fi

echo -e "${GREEN}Nginx is running${NC}"

# ============================================
# Step 3: Obtain SSL certificate
# ============================================
echo -e "${YELLOW}[3/5] Obtaining SSL certificate from Let's Encrypt...${NC}"

# Create certbot directories
mkdir -p data/certbot/www
mkdir -p data/certbot/conf

# Request certificate
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d $DOMAIN \
    -d www.$DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal

# Check if certificate was obtained
if [ ! -d "data/certbot/conf/live/$DOMAIN" ]; then
    echo -e "${RED}Error: Failed to obtain certificate${NC}"
    exit 1
fi

echo -e "${GREEN}SSL certificate obtained successfully${NC}"

# ============================================
# Step 4: Update nginx config with SSL
# ============================================
echo -e "${YELLOW}[4/5] Updating nginx config with SSL...${NC}"

cat > nginx/nginx.conf << EOF
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript 
               application/xml application/xml+rss text/javascript;

    upstream nextjs {
        server app:3000;
        keepalive 32;
    }

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN www.$DOMAIN;

        ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        client_max_body_size 50M;

        location / {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        location /_next/static/ {
            proxy_pass http://nextjs;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
EOF

# ============================================
# Step 5: Restart nginx with SSL
# ============================================
echo -e "${YELLOW}[5/5] Restarting nginx with SSL...${NC}"

docker compose restart nginx

sleep 3

# Verify HTTPS is working
if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN | grep -q "200\|301\|302"; then
    echo -e "${GREEN}HTTPS is working!${NC}"
else
    echo -e "${YELLOW}Warning: HTTPS test failed. Check nginx logs.${NC}"
fi

# ============================================
# Setup Certificate Auto-renewal
# ============================================
echo -e "${YELLOW}Setting up auto-renewal...${NC}"

# Create renewal script
cat > scripts/renew-ssl.sh << 'RENEWAL'
#!/bin/bash
cd /home/deploy/orbo
docker compose run --rm certbot renew --quiet
docker compose exec nginx nginx -s reload
RENEWAL

chmod +x scripts/renew-ssl.sh

# Add crontab entry (run twice daily as recommended by Let's Encrypt)
(crontab -l 2>/dev/null | grep -v "renew-ssl"; echo "0 3,15 * * * /home/deploy/orbo/scripts/renew-ssl.sh >> /home/deploy/orbo/scripts/ssl-renewal.log 2>&1") | crontab -

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SSL Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Certificate location: data/certbot/conf/live/$DOMAIN/"
echo "Auto-renewal: Configured (runs twice daily at 3:00 and 15:00)"
echo ""
echo "Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
echo ""

