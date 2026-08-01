from abc import ABC, abstractmethod


class BaseAgent(ABC):
    @abstractmethod
    async def handle(self, msg_id: str, fields: dict) -> None: ...

    @property
    @abstractmethod
    def message_types(self) -> set[str]: ...
