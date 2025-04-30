# LuaLoadz

A self-hosted LUA, ELF/BIN and PKG (using DPIv2 from etaHEN) sender for a receiving PS5 running the [remote-lua-loader](https://github.com/shahrilnet/remote_lua_loader). 

This tool provides a web interface for sending Lua, ELF/BIN binaries, and pakacge files all in one to your PS5 with detailed logging capabilities. 

I made this to make my workflow better when Jailbreaking my 7.61 PS5. I'm not sure whether it works on other firmwares that have capabilities of using the remote-lua-loader exploit, test it out! 

I have the latest umtx and elf_loader lua files from [Remote Lua Loader](https://github.com/shahrilnet/remote_lua_loader) but you also have the ability to manually add other lua/elf/bin/pkg files as well. You can replace the lua/elf/bin files in the `/payloads` directory in the project to have them available to send if you wish to go that route as well. 

The included ELF files are from [ps5-payload-dev](https://github.com/ps5-payload-dev), thanks to John Tornblom.

The included [etaHEN](https://github.com/etaHEN/etaHEN) is 2.1b thanks to [LightningMods](https://github.com/LightningMods)

## Features

- Web-based interface for easy file management
- Support for LUA and ELF/BIN file types
- Support for sending PKG files using DPIv2 from etaHEN (requires etaHEN DPIv2 running on port 12800)
- Detailed logging of operations
- Docker support for easy deployment
- Simple local installation option
- Local network IP scanning capabilities with open port readouts

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Docker (optional, for containerized deployment)
- PS5 with firmware version 7.61 running the remote lua loader (not tested on other firmwares but likely will work)

## Installation

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/bacedgod/lualoadz.git
cd lualoadz
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will start on port 3000 by default. Access the web interface at `http://localhost:3000`.

### Docker Installation

#### Using Docker Hub (Recommended)

1. Pull the latest image:
```bash
docker pull bacedgod/lualoadz:latest
```

2. Run the container:
```bash
docker run -p 3000:3000 bacedgod/lualoadz
```

For local network scanning functionality to work properly, you must run the container with host networking:
```bash
docker run --network host bacedgod/lualoadz
```

#### Building from Source

1. Clone the repository:
```bash
git clone https://github.com/bacedgod/lualoadz.git
cd lualoadz
```

2. Build the Docker image:
```bash
docker build -t lualoadz .
```

3. Run the container:
```bash
docker run -p 3000:3000 lualoadz
```

For local network scanning functionality to work properly, you must run the container with host networking:
```bash
docker run --network host lualoadz
```

> **Note**: The local IP scanning feature will only work when the container is running on the host network. This is because the container needs direct access to the host's network interfaces to properly scan the local network.

The web interface will be available at `http://localhost:3000`.

## Usage

1. Once deployed with your preferred method above, open your web browser and navigate to `http://localhost:3000`
3. Start the remote lua loader on your PS5
4. (Optional) Scan your network to find a PS5 (For a Docker deployment, the container requires host networking)
5. Enter your PS5's IP address and select a port - 9026 for the LUA files and 9021 for the ELF/BIN files.
6. Use the web interface to:
   - Send LUA and ELF/BIN files in the `/payloads` directory
   - Upload and send other LUA or ELF/BIN files of your choice
   - Monitor the transfer process
   - View status/logs
   - Send PKG files to install using DPIv2

## Configuration

The server runs on port 3000 by default. To change the port, modify the `server.js` file and/or the `Dockerfile` accordingly if using Docker.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


