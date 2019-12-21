package com.github.badsyntax.gradletasks;

import dagger.BindsInstance;
import dagger.Component;

@Component(modules = ApplicationModule.class)
public interface ApplicationFactory {
  Application get();

  void inject(Application application);

  @Component.Builder
  interface Builder {
    @BindsInstance
    Builder withPort(int port);
    ApplicationFactory build();
  }
}
