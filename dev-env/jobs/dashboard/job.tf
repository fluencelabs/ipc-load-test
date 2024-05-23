resource "nomad_job" "dahsboard" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true

  hcl2 {
    allow_fs = true
    vars = {
      workspace = terraform.workspace
    }
  }
}
