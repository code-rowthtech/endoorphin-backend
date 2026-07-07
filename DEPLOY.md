# Deployment Guide

## CI/CD Overview

```
Push to main
    │
    ▼
SSH into VM
    ├── git pull origin main
    ├── write .env from secrets
    ├── docker compose build api
    ├── docker compose up -d api
    ├── docker image prune -f
    └── health check → pass ✓ / fail ✗ (prints logs + exit 1)
```

---

## GitHub Secrets Required

Go to **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret**.

| Secret               | Description                                              | Example                              |
|----------------------|----------------------------------------------------------|--------------------------------------|
| `VM_HOST`            | IP address or hostname of your VM                        | `123.45.67.89`                       |
| `VM_USER`            | SSH login username                                       | `ubuntu`                             |
| `VM_SSH_KEY`         | Private SSH key (full PEM contents)                      | `-----BEGIN OPENSSH PRIVATE KEY-----`|
| `JWT_SECRET`         | Secret used to sign JWTs                                 | `a_long_random_string`               |
| `MONGO_URI`          | MongoDB connection string                                | `mongodb://mongo:27017/endoorphin`   |
| `JWT_EXPIRES_IN`     | JWT expiry duration                                      | `7d`                                 |
| `OTP_EXPIRY_MINUTES` | OTP expiry in minutes                                    | `5`                                  |

> **Never commit real secret values to the repository.**

---

## Generating the SSH Key Pair

Run this on your **local machine**:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/endorphin_deploy -N ""
```

Two files are created:
- `~/.ssh/endorphin_deploy`      ← **private key** → paste into `VM_SSH_KEY` secret
- `~/.ssh/endorphin_deploy.pub`  ← **public key**  → add to the VM

### Add the public key to your VM

```bash
ssh-copy-id -i ~/.ssh/endorphin_deploy.pub <VM_USER>@<VM_HOST>
```

Or manually:

```bash
cat ~/.ssh/endorphin_deploy.pub | ssh <VM_USER>@<VM_HOST> \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### Copy the private key into GitHub

```bash
cat ~/.ssh/endorphin_deploy
# Copy the ENTIRE output including the BEGIN/END lines into the VM_SSH_KEY secret
```

---

## First-Time VM Setup

SSH into your VM and run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Clone the repo
sudo mkdir -p /var/www/endorphin-backend
sudo chown $USER:$USER /var/www/endorphin-backend
git clone https://github.com/<your-org>/endorphin-backend.git /var/www/endorphin-backend
```

After that, every push to `main` will automatically deploy.

---

## Local Development

```bash
cp .env.example .env        # fill in your values
docker compose up --build   # starts api + mongo on port 7706
```

---

## Useful Commands on the VM

```bash
# View running containers
docker compose ps

# Stream logs
docker compose logs -f api

# Restart the API only
docker compose restart api

# Full teardown (keeps volumes)
docker compose down
```
