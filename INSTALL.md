# Ubuntu install

tuiline requires Node.js 26.4+ and Go 1.26+. Ubuntu's apt packages may
provide older versions. Install Node.js through nvm and Go from its official
download instead. Existing apt versions can remain installed.

## Install download tools

```sh
sudo apt update
sudo apt install curl ca-certificates libsecret-tools gnome-keyring
```

Login requires `secret-tool` (provided by
[libsecret-tools](https://packages.ubuntu.com/jammy/libsecret-tools)) and a running,
unlocked Secret Service provider such as
[GNOME Keyring](https://packages.ubuntu.com/jammy/gnome-keyring).
Run tuiline from a terminal in your logged-in desktop session, without `sudo`,
and unlock the login keyring if prompted. A plain SSH/headless session needs
its own working Secret Service setup.

`Ctrl+Y` confirms replacement of an existing saved LINE session. On a first
login, that confirmation is skipped and the QR code appears directly. If login
fails before a QR code appears, check the keyring and the displayed error.

## Install Node.js and npm

Install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating), then use
it to install Node.js 26. npm is included.

```sh
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

nvm install 26
nvm alias default 26
nvm use 26
```

## Install Go

Install [Go 1.27.3](https://go.dev/dl/) into your home directory. These
commands support Intel/AMD x86-64 and ARM64 Ubuntu systems.

```sh
case "$(uname -m)" in
  x86_64) go_arch=amd64 ;;
  aarch64) go_arch=arm64 ;;
  *) echo "Unsupported architecture"; exit 1 ;;
esac

curl -fL "https://go.dev/dl/go1.27.3.linux-${go_arch}.tar.gz" \
  -o /tmp/tuiline-go.tar.gz

mkdir -p "$HOME/.local"
tar -C "$HOME/.local" -xzf /tmp/tuiline-go.tar.gz

export PATH="$HOME/.local/go/bin:$PATH"
```

Make the Go path persistent. Run only the command for your shell.

For Bash (Ubuntu's default):

```sh
echo 'export PATH="$HOME/.local/go/bin:$PATH"' >> ~/.bashrc
```

For Zsh:

```sh
echo 'export PATH="$HOME/.local/go/bin:$PATH"' >> ~/.zshrc
```

## Verify and run

```sh
node --version
npm --version
go version
```

From the directory containing your downloaded `tuiline` repository:

```sh
cd ./tuiline
npm ci
npm run build:line
npm run dev
```

Run the npm commands as your normal user, without `sudo`.
The LINE backend source is bundled in this repository; no other repository
checkout is needed.

# Arch Linux install

Install Node.js, npm, and Go from the official Arch Linux repositories while
updating your system:

```sh
sudo pacman -Syu nodejs npm go
```

Or, if you already use `yay`:

```sh
yay -Syu nodejs npm go
```

The packages are listed in the official repository:
[nodejs](https://archlinux.org/packages/extra/x86_64/nodejs/),
[npm](https://archlinux.org/packages/extra/any/npm/), and
[go](https://archlinux.org/packages/extra/x86_64/go/).

Verify that Node.js is 26.4 or newer and Go is 1.26 or newer:

```sh
node --version
npm --version
go version
```

From the directory containing your downloaded `tuiline` repository:

```sh
cd ./tuiline
npm ci
npm run build:line
npm run dev
```

Run the npm commands as your normal user, without `sudo`.
The LINE backend is included in this repository; no other checkout is needed.
