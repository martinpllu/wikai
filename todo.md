# Launch

- WikAI -> wikai
- Store chat history per page.
- different link styles for pages depending on whether they have been generated or not
- Delete page button
- show costs somewhere
- configure model
- 'Projects' feature that corresponds to a directory under /data
  - I'd like to implement a projects feature where you can create a new project that's a new namespace for all pages and you can switch between projects in the UI. The default project will be called default and we need some sort of UI that shows that default is currently selected projects and allows you to create a new project. I don't necessarily want that to be present until you maybe expand the project dropdown and then there's an option there for creating a new project or maybe it's not an option in the select, maybe it's some other UI that's beside the select. But yes, it's just really when you click on the project that we should show that new projects option. And of course allow you to specify the project name. I'm thinking that projects could be organized as subdirectories under the data directory. So we probably want to move all of the existing pages into the default subdirectories. And of course we need to avoid people being able to create existing project names. 



# After launch

- anthropic and openai apis
- System prompt, e.g. always use UK English
- Starred pages
- Settings: default detail level for new pages
- Dark mode