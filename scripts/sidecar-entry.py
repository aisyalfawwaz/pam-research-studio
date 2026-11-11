"""PyInstaller entry point: keep console/stdin/stdout enabled for parent lifecycle."""
from pamstudio.server import main

if __name__ == '__main__':
    main()
