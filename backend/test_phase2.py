import json

from agent import generate_sixth_sense_response


def main():
    query = "How do we handle ESG-linked structured products?"
    response = generate_sixth_sense_response(query)

    print(f"Query: {query}")
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()