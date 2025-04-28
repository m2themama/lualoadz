# lualoadz

A self-hosted LUA and ELF sender for a receiving PS5 running the remote-lua-loader. This tool provides a web interface for sending Lua files and ELF binaries to your PS5 with detailed logging capabilities. I made this to make my workflow better when Jailbreaking my 7.61 PS5. I'm not sure whether it works on other firmwares that have capabilities of using the remote-lua-loader exploit. 

I have the latest umtx and elf_loader lua files from [Remote Lua Loader](https://github.com/shahrilnet/remote_lua_loader) but you also have the ability to manually add other lua/elf files as well. You can replace the files in the `payloads` directory in the project to have them available to send if you wish to go that route as well. 

The included ELF files are from [ps5-payload-dev](https://github.com/ps5-payload-dev), thanks to John Tornblom.

etaHEN is 2.1b (not yet released), thanks to [LightningMods](https://github.com/LightningMods)

## Features

- Web-based interface for easy file management
- Support for LUA and ELF file types
- Detailed logging of operations
- Docker support for easy deployment
- Simple local installation option
- Local network IP scanning capabilities

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Docker (optional, for containerized deployment)

## Installation

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/lualoadz.git
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

1. Build the Docker image:
```bash
docker build -t lualoadz .
```

2. Run the container:
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

1. Open your web browser and navigate to `http://localhost:3000`
2. Use the web interface to:
   - Send LUA and ELF files in the `/payloads` directory
   - Upload and send other LUA or ELF files
   - Monitor the transfer process
   - View detailed logs of operations
   - Scan for devices on your local network (For a Docker deployment, the container requires host networking)

## Configuration

The server runs on port 3000 by default. To change the port, modify the `server.js` file and/or the `Dockerfile` accordingly if using Docker.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the terms of the included LICENSE file.

## Support

For support, please open an issue in the GitHub repository. 

