#!/bin/bash
set -e

# Backup
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d)

# MaxStartups: allow 30 unauthenticated before throttling (was 10)
sed -i 's/^#MaxStartups 10:30:100/MaxStartups 30:50:100/' /etc/ssh/sshd_config

# ClientAliveInterval: server pings client every 30s (was disabled)
sed -i 's/^#ClientAliveInterval 0/ClientAliveInterval 30/' /etc/ssh/sshd_config

# ClientAliveCountMax: allow 5 missed pings before disconnect
sed -i 's/^#ClientAliveCountMax 3/ClientAliveCountMax 5/' /etc/ssh/sshd_config

# LoginGraceTime: reduce from 2min to 30s for stuck connections
sed -i 's/^#LoginGraceTime 2m/LoginGraceTime 30s/' /etc/ssh/sshd_config

# TCPKeepAlive: enable TCP-level keepalive
sed -i 's/^#TCPKeepAlive yes/TCPKeepAlive yes/' /etc/ssh/sshd_config

echo "=== Updated settings ==="
grep -E '^(MaxStartups|ClientAlive|LoginGraceTime|TCPKeepAlive|MaxSessions)' /etc/ssh/sshd_config

echo "=== Validating config ==="
sshd -t && echo "Config valid"

echo "=== Restarting sshd ==="
systemctl restart ssh
echo "DONE - sshd restarted"
